/**
 * pr-create-phase 命令
 * 建 Phase 整体 PR（所有 sub PR 合并后调用）
 * 替换 orch.md L248-255 的 gh pr create 调用
 *
 * 用法：
 *   tsx scripts/orch-cli/index.ts pr-create-phase \
 *     --phase-branch <phase-branch-name> \
 *     --phase-issue <N> \
 *     --title <PR 标题> \
 *     [--summary <摘要>] \
 *     [--dry-run]
 */

import { gh } from '../lib/gh';
import { parseArgs, requireString, requireInt, optionalString, flag } from '../lib/argv';
import { REPO } from '../lib/constants';

/**
 * 构建 Phase PR 的 body 内容
 * @param phaseIssue Phase issue 编号
 * @param summary 摘要
 * @returns body 字符串
 */
function buildPhaseBody(phaseIssue: number, summary: string): string {
  return `## Phase 摘要
${summary}

## 关联 Phase issue
#${phaseIssue}

## 合并检查
- [ ] 所有 sub-issue PR 均已合并
- [ ] 主要功能已在 phase 分支验收通过
- [ ] 无遗留 BLOCKED 问题

⚠️ **不允许自动合并，需人工确认后合并到 main**`;
}

/**
 * 执行 pr-create-phase 命令
 * @param args 命令行参数数组
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const phaseBranch = requireString(parsed, 'phase-branch', '缺少必需参数：--phase-branch <Phase 分支名>');
  const phaseIssue = requireInt(parsed, 'phase-issue', '缺少必需参数：--phase-issue <Phase issue 编号>');
  const title = requireString(parsed, 'title', '缺少必需参数：--title <PR 标题>');
  const dryRun = flag(parsed, 'dry-run');

  const summary = optionalString(parsed, 'summary') ?? '（请补充 Phase 功能摘要说明）';
  const body = buildPhaseBody(phaseIssue, summary);

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        steps: [
          `gh pr create --repo ${REPO} --base main --head ${phaseBranch} --title "${title}" --body "<see willBody>"`,
        ],
        willBody: body,
        hint: `将为 Phase #${phaseIssue} 创建整体 PR（base: main，head: ${phaseBranch}）`,
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
      'main',
      '--head',
      phaseBranch,
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
      phaseIssue,
      phaseBranch,
      hint: `Phase PR 已创建：${prUrl}`,
    }) + '\n'
  );
}
