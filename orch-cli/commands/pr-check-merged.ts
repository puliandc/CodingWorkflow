/**
 * pr-check-merged 命令
 * 查询指定 PR 的合并状态
 * 替换 orch.md L52-54 中的 gh pr view 调用
 *
 * 用法：tsx scripts/orch-cli/index.ts pr-check-merged --pr <N> [--dry-run]
 *
 * 返回 state 字段：merged | open | closed
 */

import { gh } from '../lib/gh';
import { parseArgs, requireInt, flag } from '../lib/argv';
import { REPO } from '../lib/constants';

/** PR 状态类型（gh API 返回大写，统一转小写） */
type PrState = 'merged' | 'open' | 'closed';

/**
 * 执行 pr-check-merged 命令
 * @param args 命令行参数数组
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const prNumber = requireInt(parsed, 'pr', '缺少必需参数：--pr <PR 编号>');
  const dryRun = flag(parsed, 'dry-run');

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        steps: [
          `gh pr view ${prNumber} --repo ${REPO} --json state,mergedAt --jq '{state:.state,mergedAt:.mergedAt}'`,
        ],
        hint: `查询 PR #${prNumber} 的合并状态`,
      }) + '\n'
    );
    return;
  }

  // 获取 PR 状态
  const raw = gh([
    'pr',
    'view',
    String(prNumber),
    '--repo',
    REPO,
    '--json',
    'state,mergedAt',
    '--jq',
    '{state:.state,mergedAt:.mergedAt}',
  ]);

  let prData: { state: string; mergedAt: string | null };
  try {
    prData = JSON.parse(raw) as { state: string; mergedAt: string | null };
  } catch {
    process.stderr.write(`gh pr view 响应解析失败：${raw}\n`);
    process.exit(1);
  }

  // gh API 返回大写（OPEN / CLOSED / MERGED），转小写
  const stateRaw = prData.state?.toUpperCase();
  let state: PrState;
  if (stateRaw === 'MERGED') {
    state = 'merged';
  } else if (stateRaw === 'CLOSED') {
    state = 'closed';
  } else {
    state = 'open';
  }

  const isMerged = state === 'merged';

  process.stdout.write(
    JSON.stringify({
      ok: true,
      pr: prNumber,
      state,
      mergedAt: prData.mergedAt ?? null,
      hint: isMerged
        ? `PR #${prNumber} 已合并（${prData.mergedAt}）`
        : state === 'closed'
        ? `PR #${prNumber} 已关闭（未合并）`
        : `PR #${prNumber} 仍处于 Open 状态，等待 review 与合并`,
    }) + '\n'
  );
}
