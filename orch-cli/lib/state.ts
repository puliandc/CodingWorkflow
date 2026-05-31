/**
 * Phase 级 orch 状态读写与校验
 * 状态文件固定在主仓库根 .orch/phases/phase-<issue>.json
 */

import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, rmdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig } from './config';

/**
 * 解析主仓库根目录（git common dir 的父目录）
 * 在 linked worktree 中调用时，git-common-dir 仍指向主仓库的 .git，
 * 因此返回的始终是主仓库根，保证状态文件全局唯一。
 * 非 git 仓库等异常时回退到 process.cwd()。
 */
export function mainRepoRoot(): string {
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
    // common 在主工作树可能是相对的 ".git"，在 linked worktree 是绝对路径；统一 resolve 后取父目录
    const absCommon = resolve(process.cwd(), common);
    return dirname(absCommon);
  } catch {
    return process.cwd();
  }
}

/** 当前工作树根目录（phase worktree 中会返回该 worktree 根） */
export function currentWorktreeRoot(): string {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

/** Phase 级状态目录（主仓库根下，多个 phase 各自独立文件） */
export const STATE_DIR = resolve(mainRepoRoot(), '.orch', 'phases');

/** 指定 Phase issue 的状态文件路径 */
export function stateFileForPhaseIssue(phaseIssue: number): string {
  return resolve(STATE_DIR, `phase-${phaseIssue}.json`);
}

/** 指定 Phase 分支对应的 worktree 路径 */
export function phaseWorktreePathForBranch(branchName: string): string {
  let config;
  try {
    config = loadConfig();
  } catch {
    // 降级兜底，以防在主仓库还没有 config.json 时被强行加载
  }

  if (config?.worktreeDir) {
    return resolve(mainRepoRoot(), config.worktreeDir, branchName);
  }

  const repoName = config?.repo ? config.repo.split('/')[1] : 'CodingWorkflow';
  return join(dirname(mainRepoRoot()), `${repoName}-worktrees`, branchName);
}

function parseIssueNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw.trim(), 10);
  return Number.isInteger(n) ? n : null;
}

/** 从环境变量、当前 worktree 标记或唯一状态文件推断当前 Phase issue */
export function currentPhaseIssue(): number | null {
  const fromEnv = parseIssueNumber(process.env.ORCH_PHASE_ISSUE);
  if (fromEnv !== null) return fromEnv;

  const markerPath = resolve(currentWorktreeRoot(), '.orch-phase');
  if (existsSync(markerPath)) {
    const fromMarker = parseIssueNumber(readFileSync(markerPath, 'utf8'));
    if (fromMarker !== null) return fromMarker;
  }

  try {
    if (existsSync(STATE_DIR)) {
      const files = readdirSync(STATE_DIR).filter(file => /^phase-\d+\.json$/.test(file));
      if (files.length === 1) {
        const match = files[0].match(/^phase-(\d+)\.json$/);
        return match ? parseInt(match[1], 10) : null;
      }
    }
  } catch {
    // 无法列目录时交给调用方按无状态处理
  }

  return null;
}

/** 当前命令应读取的状态文件路径；无法无歧义推断时返回 null */
export function resolveStateFile(): string | null {
  const phaseIssue = currentPhaseIssue();
  return phaseIssue === null ? null : stateFileForPhaseIssue(phaseIssue);
}

/** 仅用于 dry-run / 报错展示的状态文件路径 */
export function stateFileForMessage(): string {
  return resolveStateFile() ?? resolve(STATE_DIR, 'phase-<phase_issue>.json');
}

/** 当前上下文的进度文件路径（用于兼容既有命令输出） */
export const STATE_FILE = stateFileForMessage();
/** 当前上下文的进度文件并发锁目录（mkdir 原子互斥） */
export const STATE_LOCK_DIR = STATE_FILE + '.lock';

/** 当前 sub-issue 所处阶段 */
export type Stage = 'B' | 'C' | 'D' | 'E';

/** sub-issue 的执行状态 */
export type SubIssueStatus = 'pending' | 'in_progress' | 'pr_created' | 'merged';

/** 单个 sub-issue 的进度快照 */
export interface SubIssueState {
  /** sub-issue 编号 */
  number: number;
  /** sub-issue 中文标题 */
  title: string;
  /** 当前执行状态 */
  status: SubIssueStatus;
  /** 当前所处阶段，null 表示尚未开始或已完成 */
  currentStage: Stage | null;
  /** 已创建的 PR 编号，null 表示尚未建 PR */
  prNumber: number | null;
}

export interface WorkflowMetrics {
  needsUserInputCount: number;
  needsUserInputReasons: string[];
  precheckFailures: number;
  gateFailures: number;
  whitelistBreaches: number;
  totalLeadTimeMs: number;
  prReopenCount: number;
  startTime?: number;
}

/** 整体 Phase 进度 */
export interface OrchState {
  /** Phase issue 编号 */
  phaseIssue: number;
  /** Phase 分支名 */
  phaseBranch: string;
  /** 功能名（kebab-case 英文） */
  featureName: string;
  /** 当前 Phase 独占 worktree 绝对路径，null 表示已清理 */
  phaseWorktreePath: string | null;
  /** sub-issue 执行列表，顺序即执行顺序 */
  subIssues: SubIssueState[];
  /** [NEW] 工作流自身的效能度量指标看板 */
  metrics?: WorkflowMetrics;
}

/**
 * 读取当前 Phase 的状态文件
 * @returns OrchState 对象
 * @throws 文件不存在或格式非法时抛出中文错误
 */
export function loadState(): OrchState {
  const file = resolveStateFile();
  if (!file || !existsSync(file)) {
    throw new Error(
      `进度文件不存在：${file ?? stateFileForMessage()}\n请先运行 \`npm run orch -- state-init\` 初始化，或在对应 phase worktree 内运行命令`
    );
  }

  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`无法读取进度文件 ${file}：${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`进度文件 JSON 格式非法：${file}`);
  }

  const state = parsed as OrchState;
  // 向后兼容：旧进度文件缺少 phaseWorktreePath 时按分支名补默认路径
  if (state.phaseWorktreePath === undefined) {
    state.phaseWorktreePath = typeof state.phaseBranch === 'string'
      ? phaseWorktreePathForBranch(state.phaseBranch)
      : null;
  }
  validateState(state);
  return state;
}

/**
 * 将 OrchState 写入对应 Phase 状态文件（格式化输出）
 * @param state 要写入的状态对象
 */
export function saveState(state: OrchState): void {
  validateState(state);
  const file = stateFileForPhaseIssue(state.phaseIssue);
  const tmp = file + '.tmp';
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    renameSync(tmp, file);
  } catch (err) {
    throw new Error(`无法写入进度文件 ${file}：${(err as Error).message}`);
  }
}

/**
 * 校验 OrchState 结构完整性
 * @param state 待校验对象
 * @throws 结构不合法时抛出中文错误
 */
export function validateState(state: OrchState): void {
  if (typeof state !== 'object' || state === null) {
    throw new Error('进度文件格式错误：根节点不是对象');
  }

  if (typeof state.phaseIssue !== 'number') {
    throw new Error('进度文件格式错误：phaseIssue 必须是数字');
  }
  if (typeof state.phaseBranch !== 'string' || !state.phaseBranch) {
    throw new Error('进度文件格式错误：phaseBranch 不能为空');
  }
  if (typeof state.featureName !== 'string' || !state.featureName) {
    throw new Error('进度文件格式错误：featureName 不能为空');
  }
  if (state.phaseWorktreePath !== null && typeof state.phaseWorktreePath !== 'string') {
    throw new Error('进度文件格式错误：phaseWorktreePath 必须是字符串或 null');
  }
  if (!Array.isArray(state.subIssues)) {
    throw new Error('进度文件格式错误：subIssues 必须是数组');
  }

  const validStatuses: SubIssueStatus[] = ['pending', 'in_progress', 'pr_created', 'merged'];
  const validStages: (Stage | null)[] = ['B', 'C', 'D', 'E', null];

  for (let i = 0; i < state.subIssues.length; i++) {
    const sub = state.subIssues[i];
    const prefix = `subIssues[${i}]`;

    if (typeof sub.number !== 'number') {
      throw new Error(`进度文件格式错误：${prefix}.number 必须是数字`);
    }
    if (typeof sub.title !== 'string') {
      throw new Error(`进度文件格式错误：${prefix}.title 必须是字符串`);
    }
    if (!validStatuses.includes(sub.status)) {
      throw new Error(`进度文件格式错误：${prefix}.status 必须是 pending|in_progress|pr_created|merged`);
    }
    if (!validStages.includes(sub.currentStage)) {
      throw new Error(`进度文件格式错误：${prefix}.currentStage 必须是 B|C|D|E|null`);
    }
    if (sub.prNumber !== null && typeof sub.prNumber !== 'number') {
      throw new Error(`进度文件格式错误：${prefix}.prNumber 必须是数字或 null`);
    }
  }

  if (state.metrics !== undefined) {
    if (typeof state.metrics !== 'object' || state.metrics === null) {
      throw new Error('进度文件格式错误：metrics 必须是对象');
    }
    if (typeof state.metrics.needsUserInputCount !== 'number') {
      throw new Error('进度文件格式错误：metrics.needsUserInputCount 必须是数字');
    }
    if (typeof state.metrics.precheckFailures !== 'number') {
      throw new Error('进度文件格式错误：metrics.precheckFailures 必须是数字');
    }
    if (typeof state.metrics.gateFailures !== 'number') {
      throw new Error('进度文件格式错误：metrics.gateFailures 必须是数字');
    }
    if (typeof state.metrics.whitelistBreaches !== 'number') {
      throw new Error('进度文件格式错误：metrics.whitelistBreaches 必须是数字');
    }
  }
}

/**
 * 进度文件并发锁：多 worktree 会话同时改状态时串行化
 * 用 mkdirSync 的原子性实现互斥；获取不到则退避重试，超时抛错。
 * @param fn 临界区回调（内部做 load→mutate→save）
 */
export function withStateLock<T>(fn: () => T): T {
  const file = resolveStateFile();
  if (!file) {
    throw new Error(`无法确定当前 Phase 状态文件。请在 phase worktree 内运行，或设置 ORCH_PHASE_ISSUE`);
  }
  const lockDir = file + '.lock';
  const timeoutMs = 10000;
  const start = Date.now();
  // 自旋获取锁
  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`获取进度文件锁超时（${lockDir}）。若确认无其它 orch 进程在跑，可手动删除该锁目录后重试`);
      }
      // 同步睡眠 100ms（不引入第三方库）
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try {
    return fn();
  } finally {
    try { rmdirSync(lockDir); } catch { /* 锁目录已被清理则忽略 */ }
  }
}

/**
 * 架构契约三表结构化数据
 */
export interface ExtractedContracts {
  whitelist: string[];
  frozen: string[];
  regressionGuards: string[];
}

/**
 * 通用解析器：从 arch.md 的 Markdown 文本中提取白名单、冻结表与回归护栏
 */
export function parseArchContracts(archContent: string): ExtractedContracts {
  const whitelist: string[] = [];
  const frozen: string[] = [];
  const regressionGuards: string[] = [];

  // 1. 提取文件白名单
  const whitelistMatch = archContent.match(/#### \[契约\] 文件白名单([\s\S]*?)(?=\n#### |\Z)/);
  if (whitelistMatch) {
    const lines = whitelistMatch[1].trim().split('\n');
    for (const line of lines) {
      if (line.includes('|') && !['允许路径', '---', '允许的路径', '变更类型'].some(k => line.includes(k))) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length > 2 && parts[1]) {
          const clean = parts[1].replace(/`/g, '').trim();
          if (clean) whitelist.push(clean);
        }
      }
    }
  }

  // 2. 提取冻结表
  const frozenMatch = archContent.match(/#### \[契约\] 冻结表([\s\S]*?)(?=\n#### |\Z)/);
  if (frozenMatch) {
    const lines = frozenMatch[1].trim().split('\n');
    for (const line of lines) {
      if (line.includes('|') && !['冻结路径', '---', '说明'].some(k => line.includes(k))) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length > 2 && parts[1]) {
          const clean = parts[1].replace(/`/g, '').trim();
          if (clean) frozen.push(clean);
        }
      }
    }
  }

  // 3. 提取回归护栏
  const guardMatch = archContent.match(/#### \[契约\] 回归护栏([\s\S]*?)(?=\n#### |\Z)/);
  if (guardMatch) {
    const lines = guardMatch[1].trim().split('\n');
    for (const line of lines) {
      if (line.includes('|') && !['验证用例', '---', '期望结果', '回归脚本'].some(k => line.includes(k))) {
        const parts = line.split('|').map(p => p.trim());
        if (parts.length > 2 && parts[1]) {
          const clean = parts[1].replace(/`/g, '').trim();
          const cleanResult = parts[2] ? parts[2].replace(/`/g, '').trim() : '';
          if (clean && !['无', '暂无', '待填写'].includes(clean) && !['无', '暂无', '待填写'].includes(cleanResult)) {
            regressionGuards.push(clean);
          }
        }
      }
    }
  }

  return { whitelist, frozen, regressionGuards };
}
