/**
 * branch-create 命令
 * 创建 phase/sub 分支，校验 kebab-case 格式，自动 push -u
 * 替换 orch.md L72-77、L141-146 的 git 操作
 *
 * 用法（Phase 分支）：
 *   tsx scripts/orch-cli/index.ts branch-create \
 *     --type phase --n <Phase编号> --slug <kebab> --issue <N> [--dry-run]
 *
 * 用法（Sub 分支，必须在对应 phase worktree 内运行）：
 *   tsx scripts/orch-cli/index.ts branch-create \
 *     --type sub --n <Sub编号> --slug <kebab> --issue <N> \
 *     --from-phase-branch <phase-branch-name> [--dry-run]
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseArgs, requireString, requireInt, flag, optionalString } from '../lib/argv';
import { mainRepoRoot, currentWorktreeRoot, phaseWorktreePathForBranch } from '../lib/state';

/** kebab-case 校验正则（仅小写字母数字和连字符） */
const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * 执行 git 命令
 * @param args git 参数数组
 * @param dryRun 是否 dry-run
 * @returns stdout
 */
function git(args: string[], dryRun: boolean): string {
  if (dryRun) {
    process.stdout.write(JSON.stringify({ dryRun: true, cmd: ['git', ...args].join(' ') }) + '\n');
    return '';
  }
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string | Buffer };
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() ?? '';
    throw new Error(`git ${args.join(' ')} 失败：${stderr.trim() || e.message}`);
  }
}

function ensureCleanWorktree(): void {
  const status = git(['status', '--porcelain'], false);
  if (status) {
    throw new Error('当前 phase worktree 存在未提交改动，禁止切换/创建 sub 分支。请先提交、清理或处理这些改动后重试。');
  }
}

/**
 * 执行 branch-create 命令
 * @param args 命令行参数数组
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const type = requireString(parsed, 'type', '缺少必需参数：--type <phase|sub>');
  const n = requireInt(parsed, 'n', '缺少必需参数：--n <编号>');
  const slug = requireString(parsed, 'slug', '缺少必需参数：--slug <kebab 格式功能名>');
  const issueNumber = requireInt(parsed, 'issue', '缺少必需参数：--issue <issue 编号>');
  const dryRun = flag(parsed, 'dry-run');

  // 校验 type
  if (type !== 'phase' && type !== 'sub') {
    process.stderr.write(`无效的 --type 值："${type}"，必须是 phase 或 sub\n`);
    process.exit(1);
  }

  // 校验 kebab-case 格式
  if (!KEBAB_RE.test(slug)) {
    process.stderr.write(`kebab 格式不合法："${slug}"，只允许小写字母、数字和连字符，且不能以连字符开头或结尾\n`);
    process.exit(1);
  }

  // 计算分支名
  const branchName =
    type === 'phase'
      ? `phase-${n}-${slug}-#${issueNumber}`
      : `sub-${n}-${slug}-#${issueNumber}`;

  if (type === 'sub') {
    const fromPhaseBranch = optionalString(parsed, 'from-phase-branch');
    if (!fromPhaseBranch) {
      process.stderr.write('sub 类型分支需要 --from-phase-branch <phase 分支名>\n');
      process.exit(1);
    }

    const phaseWorktreePath = currentWorktreeRoot();

    if (dryRun) {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          dryRun: true,
          branchName,
          phaseWorktreePath,
          steps: [
            `git fetch origin`,
            `git status --porcelain  # 必须为空`,
            `git switch ${fromPhaseBranch}`,
            `git pull --ff-only origin ${fromPhaseBranch}`,
            `git switch -c ${branchName} origin/${fromPhaseBranch}`,
            `git push -u origin ${branchName}`,
          ],
          hint: `将在当前 phase worktree ${phaseWorktreePath} 内基于 origin/${fromPhaseBranch} 创建 sub 分支 ${branchName}`,
        }) + '\n'
      );
      return;
    }

    try {
      ensureCleanWorktree();
      git(['fetch', 'origin'], false);
      git(['switch', fromPhaseBranch], false);
      git(['pull', '--ff-only', 'origin', fromPhaseBranch], false);
      try {
        git(['switch', '-c', branchName, `origin/${fromPhaseBranch}`], false);
      } catch (err) {
        const message = (err as Error).message;
        if (!message.includes('already exists')) {
          throw err;
        }
        git(['switch', branchName], false);
      }
      git(['push', '-u', 'origin', branchName], false);
    } catch (err) {
      process.stderr.write((err as Error).message + '\n');
      process.exit(1);
    }

    process.stdout.write(
      JSON.stringify({
        ok: true,
        branchName,
        type,
        phaseWorktreePath,
        hint: `已在当前 phase worktree 内创建并推送 sub 分支 ${branchName}`,
      }) + '\n'
    );
    return;
  }

  // phase 分支：基于 origin/main 创建独立 phase worktree
  const repoRoot = mainRepoRoot();
  const worktreeContainer = join(dirname(repoRoot), '9zsyqss-worktrees');
  const phaseWorktreePath = phaseWorktreePathForBranch(branchName);

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        branchName,
        phaseWorktreePath,
        steps: [
          `git fetch origin`,
          `git branch ${branchName} origin/main`,
          `mkdir -p ${worktreeContainer}`,
          `git worktree add ${phaseWorktreePath} ${branchName}`,
          `ln -s ${repoRoot}/node_modules ${phaseWorktreePath}/node_modules`,
          `echo ${issueNumber} > ${phaseWorktreePath}/.orch-phase`,
          `echo ${slug} > ${phaseWorktreePath}/.orch-current`,
          `git push -u origin ${branchName}`,
        ],
        hint: `基于 origin/main 创建 phase 分支与独立 phase worktree`,
      }) + '\n'
    );
    return;
  }

  try {
    git(['fetch', 'origin'], false);
    git(['branch', branchName, 'origin/main'], false);
    mkdirSync(worktreeContainer, { recursive: true });
    git(['worktree', 'add', phaseWorktreePath, branchName], false);
    const nmLink = join(phaseWorktreePath, 'node_modules');
    if (!existsSync(nmLink)) {
      symlinkSync(join(repoRoot, 'node_modules'), nmLink, 'dir');
    }
    writeFileSync(join(phaseWorktreePath, '.orch-phase'), `${issueNumber}\n`, 'utf8');
    writeFileSync(join(phaseWorktreePath, '.orch-current'), `${slug}\n`, 'utf8');
    git(['push', '-u', 'origin', branchName], false);
  } catch (err) {
    process.stderr.write((err as Error).message + '\n');
    process.exit(1);
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      branchName,
      type,
      phaseWorktreePath,
      hint: `已创建并推送 phase 分支 ${branchName}，phase worktree：${phaseWorktreePath}`,
    }) + '\n'
  );
}
