"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const argv_1 = require("../lib/argv");
const state_1 = require("../lib/state");
const state_2 = require("../lib/state");
/** 有效的状态值 */
const VALID_STATUSES = ['pending', 'in_progress', 'pr_created', 'merged'];
/** 有效的阶段值 */
const VALID_STAGES = ['B', 'C', 'D', 'E'];
/**
 * 执行 state-advance 命令
 * @param args 命令行参数数组
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const subNumber = (0, argv_1.requireInt)(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
    const statusRaw = (0, argv_1.requireString)(parsed, 'status', '缺少必需参数：--status <pending|in_progress|pr_created|merged>');
    const stageRaw = (0, argv_1.optionalString)(parsed, 'stage');
    const prRaw = (0, argv_1.optionalString)(parsed, 'pr');
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    // 校验 status
    if (!VALID_STATUSES.includes(statusRaw)) {
        process.stderr.write(`无效的 status 值："${statusRaw}"，有效值：${VALID_STATUSES.join(' | ')}\n`);
        process.exit(1);
    }
    const status = statusRaw;
    // 校验 stage（若提供）
    let stage = null;
    if (stageRaw) {
        if (!VALID_STAGES.includes(stageRaw)) {
            process.stderr.write(`无效的 stage 值："${stageRaw}"，有效值：${VALID_STAGES.join(' | ')}\n`);
            process.exit(1);
        }
        stage = stageRaw;
    }
    // 解析 PR 编号（若提供）
    let prNumber = null;
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
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            file: state_2.STATE_FILE,
            subIssue: subNumber,
            willSet: {
                status,
                currentStage: stage,
                ...(prNumber !== null ? { prNumber } : {}),
            },
            hint: `将更新 sub-issue #${subNumber} 的状态为 ${status}${stage ? `（阶段 ${stage}）` : ''}`,
        }) + '\n');
        return;
    }
    // 在并发锁内完成 load→mutate→save，避免多 worktree 会话同时写丢更新
    let sub;
    try {
        sub = (0, state_1.withStateLock)(() => {
            const state = (0, state_1.loadState)();
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
            (0, state_1.saveState)(state);
            return target;
        });
    }
    catch (err) {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    }
    process.stdout.write(JSON.stringify({
        ok: true,
        file: state_2.STATE_FILE,
        subIssue: subNumber,
        status: sub.status,
        currentStage: sub.currentStage,
        prNumber: sub.prNumber,
        hint: `已更新 sub-issue #${subNumber} 的状态为 ${status}${sub.currentStage ? `（阶段 ${sub.currentStage}）` : ''}`,
    }) + '\n');
}
