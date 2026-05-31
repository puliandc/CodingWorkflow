/**
 * state-next 命令
 * 读取当前 Phase 级进度文件，返回同一 Phase 内的串行下一步：
 *
 * - continue-in-progress：优先继续正在执行的 sub
 * - check-pr：已有 sub PR 待合并时停止，不启动后续 pending
 * - start-pending：启动第一个 pending sub
 * - create-phase-pr：全部 sub 已 merged
 * - no-state：当前上下文没有可解析状态文件
 *
 * 用法：tsx scripts/orch-cli/index.ts state-next [--dry-run]
 *
 * 注意：--number / /orch sub <N> 已废弃。sub-issue 不支持并发启动。
 */

import { existsSync } from 'node:fs';

import { parseArgs, flag } from '../lib/argv';
import { loadState, type SubIssueState, STATE_FILE, resolveStateFile } from '../lib/state';

type NextAction =
  | 'continue-in-progress'
  | 'check-pr'
  | 'start-pending'
  | 'create-phase-pr'
  | 'no-state';

interface NextResult {
  ok: boolean;
  action: NextAction;
  phaseIssue?: number;
  phaseBranch?: string;
  phaseWorktreePath?: string | null;
  subIssue?: SubIssueState;
  hint: string;
}

export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const dryRun = flag(parsed, 'dry-run');

  if (typeof parsed['number'] !== 'undefined') {
    process.stderr.write(
      'sub-issue 不支持并发启动；请进入对应 phase worktree 后运行 `/orch`，由 state-next 按 subIssues 顺序串行推进。\n'
    );
    process.exit(1);
  }

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        file: STATE_FILE,
        hint: '将读取当前 Phase 状态文件，并按串行规则返回唯一下一步',
      }) + '\n'
    );
    return;
  }

  const file = resolveStateFile();
  if (!file || !existsSync(file)) {
    const result: NextResult = {
      ok: true,
      action: 'no-state',
      hint: '当前上下文没有可解析的 Phase 状态文件；请先运行 `/orch <Phase issue 编号>` 初始化，或进入对应 phase worktree',
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  let state;
  try {
    state = loadState();
  } catch (err) {
    process.stderr.write((err as Error).message + '\n');
    process.exit(1);
  }

  const { phaseIssue, phaseBranch, phaseWorktreePath, subIssues } = state;

  const inProgress = subIssues.find(sub => sub.status === 'in_progress');
  if (inProgress) {
    const result: NextResult = {
      ok: true,
      action: 'continue-in-progress',
      phaseIssue,
      phaseBranch,
      phaseWorktreePath,
      subIssue: inProgress,
      hint: `继续 sub-issue #${inProgress.number}「${inProgress.title}」，当前阶段 ${inProgress.currentStage ?? '未知'}。同一 Phase 内禁止启动其它 pending sub。`,
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  const prCreated = subIssues.find(sub => sub.status === 'pr_created');
  if (prCreated) {
    const result: NextResult = {
      ok: true,
      action: 'check-pr',
      phaseIssue,
      phaseBranch,
      phaseWorktreePath,
      subIssue: prCreated,
      hint: `sub-issue #${prCreated.number}「${prCreated.title}」的 PR #${prCreated.prNumber} 待合并；合并前不启动后续 pending sub。`,
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  if (subIssues.every(sub => sub.status === 'merged')) {
    const result: NextResult = {
      ok: true,
      action: 'create-phase-pr',
      phaseIssue,
      phaseBranch,
      phaseWorktreePath,
      hint: `所有 ${subIssues.length} 个 sub-issue 均已合并，请创建 Phase #${phaseIssue} 整体 PR（base: main，head: ${phaseBranch}）`,
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  const pending = subIssues.find(sub => sub.status === 'pending');
  if (pending) {
    const result: NextResult = {
      ok: true,
      action: 'start-pending',
      phaseIssue,
      phaseBranch,
      phaseWorktreePath,
      subIssue: pending,
      hint: `启动下一个串行 sub-issue #${pending.number}「${pending.title}」，从阶段 B 开始`,
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    return;
  }

  const result: NextResult = {
    ok: true,
    action: 'no-state',
    phaseIssue,
    phaseBranch,
    phaseWorktreePath,
    hint: '状态文件没有可推进的 sub-issue，请检查 subIssues 状态',
  };
  process.stdout.write(JSON.stringify(result) + '\n');
}
