/**
 * pr-create-sub 命令
 * 为 sub-issue 创建 PR，使用内置中文 body 模板
 * 替换 orch.md L214-235 的 heredoc PR body 拼装
 *
 * 用法：
 *   tsx scripts/orch-cli/index.ts pr-create-sub \
 *     --phase-branch <phase-branch-name> \
 *     --sub-branch <sub-branch-name> \
 *     --sub-issue <N> \
 *     --title <PR 标题> \
 *     [--summary <摘要文本>] \
 *     [--review-report <路径或链接>] \
 *     [--test-report <路径或链接>] \
 *     [--risk <风险说明>] \
 *     [--dry-run]
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { gh } from '../lib/gh';
import { parseArgs, requireString, requireInt, optionalString, flag } from '../lib/argv';
import { REPO } from '../lib/constants';
import { loadState } from '../lib/state';

/** Stage B 必须提交的文档（design.md 仅 needs-ui 时存在，不强制） */
const REQUIRED_DOCS_B = ['arch.md', 'test.md'] as const;
/** Stage D 必须提交的报告 */
const REQUIRED_DOCS_D = ['review-report.md', 'test-report.md'] as const;

/**
 * 执行 git 命令并返回 stdout
 * @param args git 参数
 * @returns trim 后的输出
 */
function git(args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string | Buffer };
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() ?? '';
    throw new Error(`git 命令失败：git ${args.join(' ')}\n${stderr || e.message}`);
  }
}

/**
 * 从 phase 分支名解析 phase 编号
 * @param phaseBranch 形如 phase-3-battle-refactor-#17
 */
function parsePhaseNumber(phaseBranch: string): number {
  const m = phaseBranch.match(/^phase-(\d+)-/);
  if (!m) {
    throw new Error(`无法从 phaseBranch "${phaseBranch}" 解析 phase 编号`);
  }
  return parseInt(m[1], 10);
}

/**
 * Stage E 前置硬拦截
 * 校验：docs 目录的必需文件都存在 + 工作树无未提交差异 + HEAD 已 push
 * 任一项失败即抛出中文错误
 *
 * @param subBranch 期望的 sub 分支名（与 --sub-branch 一致）
 * @param subNumber sub-issue 编号
 */
function enforcePreconditions(subBranch: string, subNumber: number): {
  docsDir: string;
  presentDocs: string[];
} {
  // 1. 当前分支必须等于 subBranch
  const currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (currentBranch !== subBranch) {
    throw new Error(
      `当前分支 "${currentBranch}" 与 --sub-branch "${subBranch}" 不一致\n` +
      `请先 git switch ${subBranch} 再创建 PR`
    );
  }

  // 2. 读 progress 推 docs 目录
  const state = loadState();
  const phaseNumber = parsePhaseNumber(state.phaseBranch);
  const docsDir = `docs/${state.featureName}/phase-${phaseNumber}/${subNumber}`;
  const absDocsDir = resolve(process.cwd(), docsDir);
  if (!existsSync(absDocsDir)) {
    throw new Error(
      `文档目录不存在：${docsDir}\n` +
      `请确认 arch/test/(design) agent 已产出文档`
    );
  }

  // 3. 必需文档存在性校验（B 阶段 + D 阶段）
  const presentDocs: string[] = [];
  const missing: string[] = [];
  for (const fname of [...REQUIRED_DOCS_B, ...REQUIRED_DOCS_D]) {
    const rel = `${docsDir}/${fname}`;
    if (existsSync(resolve(process.cwd(), rel))) {
      presentDocs.push(rel);
    } else {
      missing.push(rel);
    }
  }
  // design.md 可选，若存在也纳入 presentDocs
  const designRel = `${docsDir}/design.md`;
  if (existsSync(resolve(process.cwd(), designRel))) {
    presentDocs.push(designRel);
  }
  if (missing.length > 0) {
    throw new Error(
      `必需文档缺失，不允许创建 PR：\n` +
      missing.map(f => `  - ${f}`).join('\n') + '\n' +
      `请先派发对应 agent（arch/test/review）补齐文档`
    );
  }

  // 4. 工作树无未提交差异（限定在 docs 目录内）
  try {
    execFileSync('git', ['diff', '--quiet', 'HEAD', '--', docsDir], { encoding: 'utf8' });
  } catch {
    const dirty = git(['status', '--short', '--', docsDir]);
    throw new Error(
      `文档目录 ${docsDir} 存在未提交改动：\n${dirty}\n` +
      `请先运行 \`npm run orch -- commit-docs --sub ${subNumber} --stage <B|D>\` 提交`
    );
  }

  // 5. docs 目录中没有 untracked 文件
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', docsDir]);
  if (untracked) {
    throw new Error(
      `文档目录 ${docsDir} 存在未跟踪文件：\n${untracked}\n` +
      `请先运行 \`npm run orch -- commit-docs --sub ${subNumber} --stage <B|D>\` 提交`
    );
  }

  // 6. HEAD 已 push 到 origin/<subBranch>
  let localHead: string;
  let remoteHead: string;
  try {
    localHead = git(['rev-parse', 'HEAD']);
  } catch (err) {
    throw new Error(`无法获取本地 HEAD：${(err as Error).message}`);
  }
  try {
    // 先刷一下远端引用
    git(['fetch', 'origin', subBranch]);
    remoteHead = git(['rev-parse', `origin/${subBranch}`]);
  } catch (err) {
    throw new Error(
      `无法获取远端 origin/${subBranch}：${(err as Error).message}\n` +
      `请确认分支已 push 到远端`
    );
  }
  if (localHead !== remoteHead) {
    throw new Error(
      `本地 HEAD (${localHead.slice(0, 8)}) 与 origin/${subBranch} (${remoteHead.slice(0, 8)}) 不一致\n` +
      `请先 \`git push origin ${subBranch}\` 再创建 PR`
    );
  }

  return { docsDir, presentDocs };
}

/**
 * 构建中文 PR body 模板
 * @param subIssue sub-issue 编号
 * @param summary 摘要文本
 * @param reviewReport review 报告路径或链接
 * @param testReport test 报告路径或链接
 * @param risk 风险说明
 * @returns 格式化后的 body 字符串
 */
function buildPrBody(
  subIssue: number,
  summary: string,
  reviewReport: string,
  testReport: string,
  risk: string
): string {
  return `## 摘要
${summary}

## 三表
- review 评分：${reviewReport}
- test 通过率：${testReport}
- 关联 sub-issue：#${subIssue}

## 风险与回滚
${risk}

⚠️ **不允许自动合并，需人工确认**`;
}

/**
 * 执行 pr-create-sub 命令
 * @param args 命令行参数数组
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const phaseBranch = requireString(parsed, 'phase-branch', '缺少必需参数：--phase-branch <Phase 分支名>');
  const subBranch = requireString(parsed, 'sub-branch', '缺少必需参数：--sub-branch <Sub 分支名>');
  const subIssue = requireInt(parsed, 'sub-issue', '缺少必需参数：--sub-issue <sub-issue 编号>');
  const title = requireString(parsed, 'title', '缺少必需参数：--title <PR 标题>');
  const dryRun = flag(parsed, 'dry-run');

  // 可选参数，提供默认占位文本
  const summary = optionalString(parsed, 'summary') ?? '（请补充摘要说明）';
  const reviewReport = optionalString(parsed, 'review-report') ?? '（待补充 review 报告链接）';
  const testReport = optionalString(parsed, 'test-report') ?? '（待补充 test 报告链接）';
  const risk = optionalString(parsed, 'risk') ?? '（请说明风险与回滚方案）';

  const body = buildPrBody(subIssue, summary, reviewReport, testReport, risk);

  // Stage E 前置硬拦截：docs 必须已 commit + push
  // 该检查包括分支匹配、文件存在、工作树干净、HEAD 已推送
  let precheck: { docsDir: string; presentDocs: string[] };
  try {
    precheck = enforcePreconditions(subBranch, subIssue);
  } catch (err) {
    process.stderr.write(`[Stage E 前置校验失败]\n${(err as Error).message}\n`);
    process.exit(1);
  }

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        preflightOk: true,
        docsDir: precheck.docsDir,
        committedDocs: precheck.presentDocs,
        steps: [
          `gh pr create --repo ${REPO} --base ${phaseBranch} --head ${subBranch} --title "${title}" --body "<see willBody>"`,
        ],
        willBody: body,
        hint: `将为 sub-issue #${subIssue} 创建 PR（base: ${phaseBranch}，head: ${subBranch}），文档已就绪`,
      }) + '\n'
    );
    return;
  }

  // 创建 PR
  let prUrl: string;
  try {
    prUrl = gh([
      'pr',
      'create',
      '--repo',
      REPO,
      '--base',
      phaseBranch,
      '--head',
      subBranch,
      '--title',
      title,
      '--body',
      body,
    ]);
  } catch (err) {
    process.stderr.write((err as Error).message + '\n');
    process.exit(1);
  }

  // 从 URL 末尾提取 PR 编号
  const prNumber = parseInt(prUrl.split('/').pop() ?? '', 10);

  process.stdout.write(
    JSON.stringify({
      ok: true,
      prUrl,
      prNumber: isNaN(prNumber) ? null : prNumber,
      subIssue,
      phaseBranch,
      subBranch,
      docsDir: precheck.docsDir,
      committedDocs: precheck.presentDocs,
      hint: `PR 已创建：${prUrl}，请 review 并合并后再次运行 /orch 继续`,
    }) + '\n'
  );
}
