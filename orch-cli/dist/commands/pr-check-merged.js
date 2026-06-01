"use strict";
/**
 * pr-check-merged 命令
 * 查询指定 PR 的合并状态
 * 替换 orch.md L52-54 中的 gh pr view 调用
 *
 * 用法：tsx scripts/orch-cli/index.ts pr-check-merged --pr <N> [--dry-run]
 *
 * 返回 state 字段：merged | open | closed
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const gh_1 = require("../lib/gh");
const argv_1 = require("../lib/argv");
const constants_1 = require("../lib/constants");
/**
 * 执行 pr-check-merged 命令
 * @param args 命令行参数数组
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const prNumber = (0, argv_1.requireInt)(parsed, 'pr', '缺少必需参数：--pr <PR 编号>');
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    if (dryRun) {
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            steps: [
                `gh pr view ${prNumber} --repo ${constants_1.REPO} --json state,mergedAt --jq '{state:.state,mergedAt:.mergedAt}'`,
            ],
            hint: `查询 PR #${prNumber} 的合并状态`,
        }) + '\n');
        return;
    }
    // 获取 PR 状态
    const raw = (0, gh_1.gh)([
        'pr',
        'view',
        String(prNumber),
        '--repo',
        constants_1.REPO,
        '--json',
        'state,mergedAt',
        '--jq',
        '{state:.state,mergedAt:.mergedAt}',
    ]);
    let prData;
    try {
        prData = JSON.parse(raw);
    }
    catch {
        process.stderr.write(`gh pr view 响应解析失败：${raw}\n`);
        process.exit(1);
    }
    // gh API 返回大写（OPEN / CLOSED / MERGED），转小写
    const stateRaw = prData.state?.toUpperCase();
    let state;
    if (stateRaw === 'MERGED') {
        state = 'merged';
    }
    else if (stateRaw === 'CLOSED') {
        state = 'closed';
    }
    else {
        state = 'open';
    }
    const isMerged = state === 'merged';
    process.stdout.write(JSON.stringify({
        ok: true,
        pr: prNumber,
        state,
        mergedAt: prData.mergedAt ?? null,
        hint: isMerged
            ? `PR #${prNumber} 已合并（${prData.mergedAt}）`
            : state === 'closed'
                ? `PR #${prNumber} 已关闭（未合并）`
                : `PR #${prNumber} 仍处于 Open 状态，等待 review 与合并`,
    }) + '\n');
}
