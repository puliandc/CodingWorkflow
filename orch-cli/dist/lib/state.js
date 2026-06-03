"use strict";
/**
 * Phase 级 orch 状态读写与校验
 * 状态文件固定在主仓库根 .orch/phases/phase-<issue>.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATE_LOCK_DIR = exports.STATE_FILE = exports.STATE_DIR = void 0;
exports.mainRepoRoot = mainRepoRoot;
exports.currentWorktreeRoot = currentWorktreeRoot;
exports.stateFileForPhaseIssue = stateFileForPhaseIssue;
exports.phaseWorktreePathForBranch = phaseWorktreePathForBranch;
exports.currentPhaseIssue = currentPhaseIssue;
exports.resolveStateFile = resolveStateFile;
exports.stateFileForMessage = stateFileForMessage;
exports.loadState = loadState;
exports.saveState = saveState;
exports.validateState = validateState;
exports.withStateLock = withStateLock;
exports.parseArchContracts = parseArchContracts;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
const config_1 = require("./config");
/**
 * 解析主仓库根目录（git common dir 的父目录）
 * 在 linked worktree 中调用时，git-common-dir 仍指向主仓库的 .git，
 * 因此返回的始终是主仓库根，保证状态文件全局唯一。
 * 非 git 仓库等异常时回退到 process.cwd()。
 */
function mainRepoRoot() {
    try {
        const common = (0, node_child_process_1.execFileSync)('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
        // common 在主工作树可能是相对的 ".git"，在 linked worktree 是绝对路径；统一 resolve 后取父目录
        const absCommon = (0, node_path_1.resolve)(process.cwd(), common);
        return (0, node_path_1.dirname)(absCommon);
    }
    catch {
        return process.cwd();
    }
}
/** 当前工作树根目录（phase worktree 中会返回该 worktree 根） */
function currentWorktreeRoot() {
    try {
        return (0, node_child_process_1.execFileSync)('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    }
    catch {
        return process.cwd();
    }
}
/** Phase 级状态目录（主仓库根下，多个 phase 各自独立文件） */
exports.STATE_DIR = (0, node_path_1.resolve)(mainRepoRoot(), '.orch', 'phases');
/** 指定 Phase issue 的状态文件路径 */
function stateFileForPhaseIssue(phaseIssue) {
    return (0, node_path_1.resolve)(exports.STATE_DIR, `phase-${phaseIssue}.json`);
}
/** 指定 Phase 分支对应的 worktree 路径 */
function phaseWorktreePathForBranch(branchName) {
    let config;
    try {
        config = (0, config_1.loadConfig)();
    }
    catch {
        // 降级兜底，以防在主仓库还没有 config.json 时被强行加载
    }
    if (config?.worktreeDir) {
        return (0, node_path_1.resolve)(mainRepoRoot(), config.worktreeDir, branchName);
    }
    const repoName = config?.repo ? config.repo.split('/')[1] : 'CodingWorkflow';
    return (0, node_path_1.join)((0, node_path_1.dirname)(mainRepoRoot()), `${repoName}-worktrees`, branchName);
}
function parseIssueNumber(raw) {
    if (!raw)
        return null;
    const n = parseInt(raw.trim(), 10);
    return Number.isInteger(n) ? n : null;
}
/** 从环境变量、当前 worktree 标记或唯一状态文件推断当前 Phase issue */
function currentPhaseIssue() {
    const fromEnv = parseIssueNumber(process.env.ORCH_PHASE_ISSUE);
    if (fromEnv !== null)
        return fromEnv;
    const markerPath = (0, node_path_1.resolve)(currentWorktreeRoot(), '.orch-phase');
    if ((0, node_fs_1.existsSync)(markerPath)) {
        const fromMarker = parseIssueNumber((0, node_fs_1.readFileSync)(markerPath, 'utf8'));
        if (fromMarker !== null)
            return fromMarker;
    }
    try {
        if ((0, node_fs_1.existsSync)(exports.STATE_DIR)) {
            const files = (0, node_fs_1.readdirSync)(exports.STATE_DIR).filter(file => /^phase-\d+\.json$/.test(file));
            if (files.length === 1) {
                const match = files[0].match(/^phase-(\d+)\.json$/);
                return match ? parseInt(match[1], 10) : null;
            }
        }
    }
    catch {
        // 无法列目录时交给调用方按无状态处理
    }
    return null;
}
/** 当前命令应读取的状态文件路径；无法无歧义推断时返回 null */
function resolveStateFile() {
    const phaseIssue = currentPhaseIssue();
    return phaseIssue === null ? null : stateFileForPhaseIssue(phaseIssue);
}
/** 仅用于 dry-run / 报错展示的状态文件路径 */
function stateFileForMessage() {
    return resolveStateFile() ?? (0, node_path_1.resolve)(exports.STATE_DIR, 'phase-<phase_issue>.json');
}
/** 当前上下文的进度文件路径（用于兼容既有命令输出） */
exports.STATE_FILE = stateFileForMessage();
/** 当前上下文的进度文件并发锁目录（mkdir 原子互斥） */
exports.STATE_LOCK_DIR = exports.STATE_FILE + '.lock';
/**
 * 读取当前 Phase 的状态文件
 * @returns OrchState 对象
 * @throws 文件不存在或格式非法时抛出中文错误
 */
function loadState() {
    const file = resolveStateFile();
    if (!file || !(0, node_fs_1.existsSync)(file)) {
        throw new Error(`进度文件不存在：${file ?? stateFileForMessage()}\n请先运行 \`npm run orch -- state-init\` 初始化，或在对应 phase worktree 内运行命令`);
    }
    let raw;
    try {
        raw = (0, node_fs_1.readFileSync)(file, 'utf8');
    }
    catch (err) {
        throw new Error(`无法读取进度文件 ${file}：${err.message}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error(`进度文件 JSON 格式非法：${file}`);
    }
    const state = parsed;
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
function saveState(state) {
    validateState(state);
    const file = stateFileForPhaseIssue(state.phaseIssue);
    const tmp = file + '.tmp';
    try {
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(file), { recursive: true });
        (0, node_fs_1.writeFileSync)(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
        (0, node_fs_1.renameSync)(tmp, file);
    }
    catch (err) {
        throw new Error(`无法写入进度文件 ${file}：${err.message}`);
    }
}
/**
 * 校验 OrchState 结构完整性
 * @param state 待校验对象
 * @throws 结构不合法时抛出中文错误
 */
function validateState(state) {
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
    const validStatuses = ['pending', 'in_progress', 'pr_created', 'merged'];
    const validStages = ['B', 'C', 'D', 'E', null];
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
function withStateLock(fn) {
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
            (0, node_fs_1.mkdirSync)(lockDir);
            break;
        }
        catch {
            if (Date.now() - start > timeoutMs) {
                throw new Error(`获取进度文件锁超时（${lockDir}）。若确认无其它 orch 进程在跑，可手动删除该锁目录后重试`);
            }
            // 同步睡眠 100ms（不引入第三方库）
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        }
    }
    try {
        return fn();
    }
    finally {
        try {
            (0, node_fs_1.rmdirSync)(lockDir);
        }
        catch { /* 锁目录已被清理则忽略 */ }
    }
}
/**
 * 通用解析器：从 arch.md 的 Markdown 文本中提取白名单、冻结表与回归护栏
 */
function parseArchContracts(archContent) {
    const whitelist = [];
    const frozen = [];
    const regressionGuards = [];
    // 1. 提取文件白名单
    const whitelistMatch = archContent.match(/#### \[契约\] 文件白名单([\s\S]*?)(?=\n#### |$)/);
    if (whitelistMatch) {
        const lines = whitelistMatch[1].trim().split('\n');
        for (const line of lines) {
            if (!line.includes('|'))
                continue;
            const parts = line.split('|').map(p => p.trim());
            // 整格精确匹配表头 + 分隔行正则，避免路径含表头同名子串被误过滤
            const isHeader = ['允许路径', '允许的路径', '变更类型'].some(k => parts[1] === k || parts[2] === k);
            const isSeparator = /^:?-{3,}:?$/.test(parts[1] || '');
            if (isHeader || isSeparator)
                continue;
            if (parts.length > 2 && parts[1]) {
                const clean = parts[1].replace(/`/g, '').trim();
                if (clean)
                    whitelist.push(clean);
            }
        }
    }
    // 2. 提取冻结表
    const frozenMatch = archContent.match(/#### \[契约\] 冻结表([\s\S]*?)(?=\n#### |$)/);
    if (frozenMatch) {
        const lines = frozenMatch[1].trim().split('\n');
        for (const line of lines) {
            if (!line.includes('|'))
                continue;
            const parts = line.split('|').map(p => p.trim());
            // 整格精确匹配表头 + 分隔行正则，避免路径/说明含表头同名子串被误过滤
            const isHeader = ['冻结路径', '说明'].some(k => parts[1] === k || parts[2] === k);
            const isSeparator = /^:?-{3,}:?$/.test(parts[1] || '');
            if (isHeader || isSeparator)
                continue;
            if (parts.length > 2 && parts[1]) {
                const clean = parts[1].replace(/`/g, '').trim();
                if (clean)
                    frozen.push(clean);
            }
        }
    }
    // 3. 提取回归护栏
    const guardMatch = archContent.match(/#### \[契约\] 回归护栏([\s\S]*?)(?=\n#### |$)/);
    if (guardMatch) {
        const lines = guardMatch[1].trim().split('\n');
        for (const line of lines) {
            if (!line.includes('|'))
                continue;
            const parts = line.split('|').map(p => p.trim());
            // 仅当关键词作为整格内容出现时才判定为表头（避免数据行结果列含「期望结果」等子串被误过滤）
            const isHeader = ['验证用例', '期望结果', '回归脚本'].some(k => parts[1] === k || parts[2] === k);
            // 分隔行：单格内容为纯破折号/冒号（如 ---、:---:、------）
            const isSeparator = /^:?-{3,}:?$/.test(parts[1] || '');
            if (isHeader || isSeparator)
                continue;
            if (parts.length > 2 && parts[1]) {
                const clean = parts[1].replace(/`/g, '').trim();
                const cleanResult = parts[2] ? parts[2].replace(/`/g, '').trim() : '';
                if (clean && !['无', '暂无', '待填写'].includes(clean) && !['无', '暂无', '待填写'].includes(cleanResult)) {
                    regressionGuards.push(clean);
                }
            }
        }
    }
    return { whitelist, frozen, regressionGuards };
}
