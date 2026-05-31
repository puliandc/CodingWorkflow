/**
 * state-advance 命令
 * 更新进度文件中某个 sub-issue 的状态字段
 * 替换 orch.md 中散落的"更新进度文件"操作
 *
 * 用法：
 *   tsx scripts/orch-cli/index.ts state-advance \
 *     --sub <sub-issue编号> \
 *     --status <pending|in_progress|pr_created|merged> \
 *     [--stage <B|C|D|E>] \
 *     [--pr <PR编号>] \
 *     [--dry-run]
 *
 * --stage 仅在 status=in_progress 时有意义（指定当前阶段）
 * --pr 仅在 status=pr_created 时需要（记录 PR 编号）
 */

import { parseArgs, requireInt, requireString, optionalString, flag } from '../lib/argv';
import { loadState, saveState, withStateLock, type Stage, type SubIssueState, type SubIssueStatus } from '../lib/state';
import { STATE_FILE } from '../lib/state';

/** 有效的状态值 */
const VALID_STATUSES: SubIssueStatus[] = ['pending', 'in_progress', 'pr_created', 'merged'];

/** 有效的阶段值 */
const VALID_STAGES: Stage[] = ['B', 'C', 'D', 'E'];

/**
 * 执行 state-advance 命令
 * @param args 命令行参数数组
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const subNumber = requireInt(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
  const statusRaw = requireString(parsed, 'status', '缺少必需参数：--status <pending|in_progress|pr_created|merged>');
  const stageRaw = optionalString(parsed, 'stage');
  const prRaw = optionalString(parsed, 'pr');
  const dryRun = flag(parsed, 'dry-run');

  // 校验 status
  if (!VALID_STATUSES.includes(statusRaw as SubIssueStatus)) {
    process.stderr.write(`无效的 status 值："${statusRaw}"，有效值：${VALID_STATUSES.join(' | ')}\n`);
    process.exit(1);
  }
  const status = statusRaw as SubIssueStatus;

  // 校验 stage（若提供）
  let stage: Stage | null = null;
  if (stageRaw) {
    if (!VALID_STAGES.includes(stageRaw as Stage)) {
      process.stderr.write(`无效的 stage 值："${stageRaw}"，有效值：${VALID_STAGES.join(' | ')}\n`);
      process.exit(1);
    }
    stage = stageRaw as Stage;
  }

  // 解析 PR 编号（若提供）
  let prNumber: number | null = null;
  if (prRaw) {
    prNumber = parseInt(prRaw, 10);
    if (isNaN(prNumber)) {
      process.stderr.write(`--pr 必须是整数，收到："${prRaw}"\n`);
      process.exit(1);
    }
  }

  // pr_created 状态必须提供 prNumber
  if (status === 'pr_created' && prNumber === null) {
    process.stderr.write('status=pr_created 时必须提供 --pr <PR 编号>\n');
    process.exit(1);
  }

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        file: STATE_FILE,
        subIssue: subNumber,
        willSet: {
          status,
          currentStage: stage,
          ...(prNumber !== null ? { prNumber } : {}),
        },
        hint: `将更新 sub-issue #${subNumber} 的状态为 ${status}${stage ? `（阶段 ${stage}）` : ''}`,
      }) + '\n'
    );
    return;
  }

  // 在并发锁内完成 load→mutate→save，避免多 worktree 会话同时写丢更新
  let sub: SubIssueState;
  try {
    sub = withStateLock(() => {
      const state = loadState();
      const subIndex = state.subIssues.findIndex(s => s.number === subNumber);
      if (subIndex === -1) {
        throw new Error(`进度文件中未找到 sub-issue #${subNumber}`);
      }
      const target = state.subIssues[subIndex];

      // 更新字段
      target.status = status;
      if (stage !== null) {
        target.currentStage = stage;
      }
      // merged 或 pending 时清空 currentStage
      if (status === 'merged' || status === 'pending') {
        target.currentStage = null;
      }
      if (prNumber !== null) {
        target.prNumber = prNumber;
      }

      saveState(state);
      return target;
    });
  } catch (err) {
    process.stderr.write((err as Error).message + '\n');
    process.exit(1);
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      file: STATE_FILE,
      subIssue: subNumber,
      status: sub.status,
      currentStage: sub.currentStage,
      prNumber: sub.prNumber,
      hint: `已更新 sub-issue #${subNumber} 的状态为 ${status}${sub.currentStage ? `（阶段 ${sub.currentStage}）` : ''}`,
    }) + '\n'
  );
}
