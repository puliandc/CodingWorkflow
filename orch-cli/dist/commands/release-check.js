"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const argv_1 = require("../lib/argv");
const state_1 = require("../lib/state");
const config_1 = require("../lib/config");
const verdict_1 = require("../lib/verdict");
/**
 * release-check 子命令：审计生产部署与一键回退 Runbook
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const subNumber = (0, argv_1.requireInt)(parsed, 'sub-issue', '缺少必需参数：--sub-issue <sub-issue 编号>');
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    // 1. 加载配置与状态
    let config;
    let state;
    try {
        config = (0, config_1.loadConfig)();
        state = (0, state_1.loadState)();
    }
    catch (err) {
        process.stderr.write(`❌ 发布门禁校验失败：${err.message}\n`);
        process.exit(1);
    }
    const gates = config.workflowGates || {};
    const releasePolicy = gates.release || 'block';
    if (releasePolicy === 'off') {
        process.stdout.write(JSON.stringify({
            ok: true,
            passed: true,
            hint: '🎉 发布回滚门禁已被配置关闭(off)，透明放行。',
        }) + '\n');
        return;
    }
    const reportPath = (0, node_path_1.resolve)((0, state_1.mainRepoRoot)(), `docs/release/release-plan-${subNumber}.md`);
    if (dryRun) {
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            reportPath,
            hint: `[Dry-Run] 将审计发布回滚计划 docs/release/release-plan-${subNumber}.md 是否健全。`,
        }) + '\n');
        return;
    }
    // 2. 检查计划文件是否存在
    if (!(0, node_fs_1.existsSync)(reportPath)) {
        const errorMsg = `❌ 发布门禁拦截：缺少发布 Runbook 文件 docs/release/release-plan-${subNumber}.md！\n`;
        if (releasePolicy === 'block') {
            process.stderr.write(errorMsg + '上线前的最后一公里必须有灰度与一键回退 Runbook 保障！\n');
            process.exit(1);
        }
        else {
            process.stdout.write(JSON.stringify({
                ok: true,
                passed: true,
                warning: true,
                hint: `⚠️ [P1 警告] ${errorMsg}`,
            }) + '\n');
            return;
        }
    }
    // 3. 审计报告内容
    const content = (0, node_fs_1.readFileSync)(reportPath, 'utf8');
    // 优先消费结构化 VERDICT 块
    const verdictResult = (0, verdict_1.parseVerdict)(content);
    if (verdictResult !== null) {
        // 找到了 VERDICT 块（合法或非法）
        if (verdictResult.status === 'invalid') {
            // VERDICT 块存在但非法 → 门禁必须失败，绝不放行
            const errorMsg = `❌ 发布门禁拦截：docs/release/release-plan-${subNumber}.md 含有非法 VERDICT 块，无法解析裁决——${verdictResult.reason}\n`;
            process.stderr.write(errorMsg + '请修正报告中的 VERDICT 块后重试！\n');
            process.exit(1);
        }
        // verdictResult.status === 'ok'
        const { verdict } = verdictResult.verdict;
        if (verdict === 'block') {
            const findings = verdictResult.verdict.findings?.join('；') ?? '';
            const errorMsg = `❌ 发布门禁拦截：docs/release/release-plan-${subNumber}.md VERDICT=block，发布计划未通过裁决！${findings ? `\n  发现项：${findings}` : ''}\n`;
            if (releasePolicy === 'block') {
                process.stderr.write(errorMsg + '上线前的最后一公里必须有灰度与一键回退 Runbook 保障！\n');
                process.exit(1);
            }
            else {
                process.stdout.write(JSON.stringify({
                    ok: true,
                    passed: true,
                    warning: true,
                    hint: `⚠️ [P1 警告] ${errorMsg}`,
                }) + '\n');
                return;
            }
        }
        if (verdict === 'warn') {
            process.stdout.write(JSON.stringify({
                ok: true,
                passed: true,
                warning: true,
                hint: `⚠️ [P1 警告] docs/release/release-plan-${subNumber}.md VERDICT=warn，发布计划存在隐患，建议优化后合入。`,
            }) + '\n');
            return;
        }
        // verdict === 'pass'
        process.stdout.write(JSON.stringify({
            ok: true,
            passed: true,
            hint: '🎉 部署发布与生产一键回退 Runbook 审计通过（VERDICT=pass）！FF/灰度/回滚机制完善，允许提单 PR。',
        }) + '\n');
        return;
    }
    // 无 VERDICT 块 → 兜底：回退现有存在性检查逻辑（向后兼容）
    // 必须断言有 Feature Flag 描述
    if (!content.includes('Feature Flag') && !content.includes('FF_')) {
        const errorMsg = `❌ 发布门禁拦截：docs/release/release-plan-${subNumber}.md 缺失 Feature Flag 功能开关命名与灰度计划！\n`;
        if (releasePolicy === 'block') {
            process.stderr.write(errorMsg);
            process.exit(1);
        }
        else {
            process.stdout.write(JSON.stringify({
                ok: true,
                passed: true,
                warning: true,
                hint: `⚠️ [P1 警告] ${errorMsg}`,
            }) + '\n');
            return;
        }
    }
    // 必须包含物理一键回滚 Runbook 步骤
    if (!content.includes('一键物理回滚 Runbook') && !content.includes('Disaster Recovery')) {
        const errorMsg = `❌ 发布门禁拦截：docs/release/release-plan-${subNumber}.md 缺失「生产一键物理回滚 Runbook」关键救援章节！\n`;
        if (releasePolicy === 'block') {
            process.stderr.write(errorMsg);
            process.exit(1);
        }
        else {
            process.stdout.write(JSON.stringify({
                ok: true,
                passed: true,
                warning: true,
                hint: `⚠️ [P1 警告] ${errorMsg}`,
            }) + '\n');
            return;
        }
    }
    // 4. 若开启了 migrationCheck，且检测到 Migration，必须有 down.sql 或数据回滚 SQL 描述
    if (config.migrationCheck === true) {
        const phaseBranch = state.phaseBranch;
        const phaseMatch = phaseBranch.match(/^phase-(\d+)-/);
        if (phaseMatch) {
            const phaseNumber = parseInt(phaseMatch[1], 10);
            const archPath = (0, node_path_1.resolve)(process.cwd(), `docs/${state.featureName}/phase-${phaseNumber}/${subNumber}/arch.md`);
            if ((0, node_fs_1.existsSync)(archPath)) {
                const archContent = (0, node_fs_1.readFileSync)(archPath, 'utf8');
                const isDbMigration = archContent.includes('数据迁移与 Schema 契约') || archContent.includes('[契约] 数据迁移');
                if (isDbMigration) {
                    if (!content.includes('数据回滚 SQL') && !content.includes('rollback') && !content.includes('down.sql')) {
                        const errorMsg = `❌ [P0 阻断] 数据库迁移任务未通过！已登记 Schema 变更，但在 docs/release/release-plan-${subNumber}.md 物理 Runbook 中缺失「数据回滚与 Schema 补偿」物理 SQL 或命令！\n`;
                        process.stderr.write(errorMsg);
                        process.exit(1);
                    }
                }
            }
        }
    }
    process.stdout.write(JSON.stringify({
        ok: true,
        passed: true,
        hint: '🎉 部署发布与生产一键回退 Runbook 审计通过！FF/灰度/回滚机制完善，允许提单 PR。',
    }) + '\n');
}
