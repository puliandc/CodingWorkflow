"use strict";
/**
 * state-init 命令
 * 初始化 Phase 级 .orch/phases/phase-<issue>.json 进度文件
 * 替换 orch.md L96-114 的 JSON 模板
 *
 * 用法：
 *   tsx scripts/orch-cli/index.ts state-init \
 *     --phase-issue <N> \
 *     --branch <phase-branch-name> \
 *     --feature <功能名> \
 *     --sub-issues '<json-array>' \
 *     [--dry-run]
 *
 * --sub-issues 格式（JSON 数组）：
 *   '[{"number":42,"title":"子功能标题"},{"number":43,"title":"子功能B"}]'
 *
 * 数组顺序即同一 Phase 内 sub-issue 的串行执行顺序
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const argv_1 = require("../lib/argv");
const state_1 = require("../lib/state");
const node_fs_1 = require("node:fs");
/**
 * 执行 state-init 命令
 * @param args 命令行参数数组
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const phaseIssue = (0, argv_1.requireInt)(parsed, 'phase-issue', '缺少必需参数：--phase-issue <Phase issue 编号>');
    const branch = (0, argv_1.requireString)(parsed, 'branch', '缺少必需参数：--branch <Phase 分支名>');
    const feature = (0, argv_1.requireString)(parsed, 'feature', '缺少必需参数：--feature <功能名>');
    const subIssuesRaw = (0, argv_1.requireString)(parsed, 'sub-issues', '缺少必需参数：--sub-issues \'[{"number":N,"title":"..."}]\'');
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    // 解析 sub-issues JSON
    let subInputs;
    try {
        const rawParsed = JSON.parse(subIssuesRaw);
        if (!Array.isArray(rawParsed)) {
            throw new Error('必须是 JSON 数组');
        }
        subInputs = rawParsed;
    }
    catch (err) {
        process.stderr.write(`--sub-issues 参数解析失败：${err.message}\n`);
        process.exit(1);
    }
    // 校验每个 sub-issue 输入
    for (let i = 0; i < subInputs.length; i++) {
        const sub = subInputs[i];
        if (typeof sub.number !== 'number') {
            process.stderr.write(`sub-issues[${i}].number 必须是数字\n`);
            process.exit(1);
        }
        if (typeof sub.title !== 'string' || !sub.title) {
            process.stderr.write(`sub-issues[${i}].title 不能为空\n`);
            process.exit(1);
        }
    }
    // 构建 OrchState 对象
    const subIssues = subInputs.map(s => ({
        number: s.number,
        title: s.title,
        status: 'pending',
        currentStage: null,
        prNumber: null,
    }));
    const stateFile = (0, state_1.stateFileForPhaseIssue)(phaseIssue);
    const state = {
        phaseIssue,
        phaseBranch: branch,
        featureName: feature,
        phaseWorktreePath: (0, state_1.phaseWorktreePathForBranch)(branch),
        subIssues,
        metrics: {
            needsUserInputCount: 0,
            needsUserInputReasons: [],
            precheckFailures: 0,
            gateFailures: 0,
            whitelistBreaches: 0,
            totalLeadTimeMs: 0,
            prReopenCount: 0,
            startTime: Date.now(),
        },
    };
    if (dryRun) {
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            file: stateFile,
            willWrite: state,
            hint: `将初始化 Phase 级进度文件 ${stateFile}，包含 ${subIssues.length} 个串行 sub-issue`,
        }) + '\n');
        return;
    }
    // 检查文件是否已存在（防止意外覆盖）
    if ((0, node_fs_1.existsSync)(stateFile)) {
        process.stderr.write(`进度文件已存在：${stateFile}\n` +
            `若要重新初始化，请先手动删除该文件\n`);
        process.exit(1);
    }
    try {
        (0, state_1.saveState)(state);
    }
    catch (err) {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    }
    process.stdout.write(JSON.stringify({
        ok: true,
        file: stateFile,
        phaseIssue,
        phaseBranch: branch,
        featureName: feature,
        subIssueCount: subIssues.length,
        hint: `已初始化 Phase 级进度文件，包含 ${subIssues.length} 个串行 sub-issue（执行顺序：${subIssues.map(s => `#${s.number}`).join(' → ')}）`,
    }) + '\n');
}
