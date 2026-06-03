"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
const argv_1 = require("../lib/argv");
const state_1 = require("../lib/state");
const config_1 = require("../lib/config");
/**
 * 从 phase 分支名解析 phase 编号
 */
function parsePhaseNumber(phaseBranch) {
    const m = phaseBranch.match(/^phase-(\d+)-/);
    if (!m) {
        throw new Error(`无法从 phaseBranch "${phaseBranch}" 解析 phase 编号`);
    }
    return parseInt(m[1], 10);
}
/**
 * precheck 命令：在派发 coding 前进行确定性的契约与文档质量门禁校验
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const subNumber = (0, argv_1.requireInt)(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    // 1. 读取项目配置与进度状态
    let config;
    let state;
    try {
        config = (0, config_1.loadConfig)();
        state = (0, state_1.loadState)();
    }
    catch (err) {
        process.stderr.write(`❌ 门禁拦截：${err.message}\n`);
        process.exit(1);
    }
    let phaseNumber;
    try {
        phaseNumber = parsePhaseNumber(state.phaseBranch);
    }
    catch (err) {
        process.stderr.write(`❌ 门禁拦截：${err.message}\n`);
        process.exit(1);
    }
    const gates = config.workflowGates || {};
    const intakePolicy = gates.intake || 'block';
    const probingPolicy = gates.probing || 'warn';
    const adrPolicy = gates.adr || 'block';
    if (dryRun) {
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            hint: '将对子任务进行全链路 Graded Precheck (Triage ➔ Probing ➔ ADR ➔ Contract Collision ➔ Arch 三表 ➔ Migration Check)',
        }) + '\n');
        return;
    }
    // ----------------------------------------------------
    // 阶段 0: 校验需求入口准入 (Intake Report)
    // ----------------------------------------------------
    if (intakePolicy !== 'off') {
        const intakePath = (0, node_path_1.resolve)((0, state_1.mainRepoRoot)(), `docs/triage/intake-${state.phaseIssue}.md`);
        if (!(0, node_fs_1.existsSync)(intakePath)) {
            const msg = `❌ [P0 阻断] 需求准入报告 docs/triage/intake-${state.phaseIssue}.md 缺失！\n请确保已在 Phase 0 启动 triage agent 并通过审核。\n`;
            if (intakePolicy === 'block') {
                process.stderr.write(msg);
                process.exit(1);
            }
            else {
                process.stderr.write(`⚠️ [P1 警告] ${msg}`);
            }
        }
    }
    // ----------------------------------------------------
    // 阶段 A1: 校验全库防撞车探照 (Probing Report)
    // ----------------------------------------------------
    if (probingPolicy !== 'off') {
        const probingPath = (0, node_path_1.resolve)((0, state_1.mainRepoRoot)(), `docs/discovery/probing-${state.phaseIssue}.md`);
        if (!(0, node_fs_1.existsSync)(probingPath)) {
            const msg = `❌ [Probing 缺口] 防撞车探波报告 docs/discovery/probing-${state.phaseIssue}.md 缺失！\n`;
            if (probingPolicy === 'block') {
                process.stderr.write(msg);
                process.exit(1);
            }
            else {
                process.stderr.write(`⚠️ [P1 警告] ${msg}`);
            }
        }
    }
    // ----------------------------------------------------
    // 阶段 B: 校验架构方案决策 (ADR Report)
    // ----------------------------------------------------
    if (adrPolicy !== 'off') {
        const adrPath = (0, node_path_1.resolve)((0, state_1.mainRepoRoot)(), `docs/adr/adr-${subNumber}.md`);
        if (!(0, node_fs_1.existsSync)(adrPath)) {
            const msg = `❌ [ADR 缺口] 架构决策对比文件 docs/adr/adr-${subNumber}.md 缺失！\n请确保已在设计阶段进行方案双选与取舍记录。\n`;
            if (adrPolicy === 'block') {
                process.stderr.write(msg);
                process.exit(1);
            }
            else {
                process.stderr.write(`⚠️ [P1 警告] ${msg}`);
            }
        }
        else {
            const adrContent = (0, node_fs_1.readFileSync)(adrPath, 'utf8');
            if (!adrContent.includes('方案 A vs 方案 B 对比表') && !adrContent.includes('Trade-offs')) {
                const msg = `❌ [ADR 致命] docs/adr/adr-${subNumber}.md 缺少方案双选对比或权衡 Trade-offs 大沙盘！\n`;
                if (adrPolicy === 'block') {
                    process.stderr.write(msg);
                    process.exit(1);
                }
                else {
                    process.stderr.write(`⚠️ [P1 警告] ${msg}`);
                }
            }
            if (!adrContent.includes('决策未来反悔/失效条件') && !adrContent.includes('Reversibility')) {
                const msg = `❌ [ADR 致命] docs/adr/adr-${subNumber}.md 缺少决策未来反悔与失效指标设定！\n`;
                if (adrPolicy === 'block') {
                    process.stderr.write(msg);
                    process.exit(1);
                }
                else {
                    process.stderr.write(`⚠️ [P1 警告] ${msg}`);
                }
            }
        }
    }
    // ----------------------------------------------------
    // 并发校验: 语义锁碰撞冲突检测 (Contract Collision)
    // ----------------------------------------------------
    try {
        // 命令文件无自执行入口（仅 export run），必须经 index.js 派发器调用才会真正执行碰撞检测
        const indexScript = (0, node_path_1.resolve)(__dirname, '..', 'index.js');
        if ((0, node_fs_1.existsSync)(indexScript)) {
            (0, node_child_process_1.execFileSync)('node', [indexScript, 'contract-check', '--sub', String(subNumber)], { stdio: 'inherit' });
        }
    }
    catch {
        // 碰撞检测抛错直接阻断
        process.stderr.write(`❌ 门禁拦截：并发语义锁校验失败，发现严重的并发修改冲突！\n`);
        process.exit(1);
    }
    // ----------------------------------------------------
    // 经典契约三表与占位符强校验
    // ----------------------------------------------------
    const docsDir = `docs/${state.featureName}/phase-${phaseNumber}/${subNumber}`;
    const absDocsDir = (0, node_path_1.resolve)(process.cwd(), docsDir);
    const archPath = (0, node_path_1.resolve)(absDocsDir, 'arch.md');
    const testPath = (0, node_path_1.resolve)(absDocsDir, 'test.md');
    if (!(0, node_fs_1.existsSync)(archPath)) {
        process.stderr.write(`❌ 门禁拦截：架构锁定契约不存在：${docsDir}/arch.md\n请先派发 arch agent 产出设计。\n`);
        process.exit(1);
    }
    if (!(0, node_fs_1.existsSync)(testPath)) {
        process.stderr.write(`❌ 门禁拦截：测试方案契约不存在：${docsDir}/test.md\n请确认测试方案已就绪。\n`);
        process.exit(1);
    }
    const archContent = (0, node_fs_1.readFileSync)(archPath, 'utf8');
    const testContent = (0, node_fs_1.readFileSync)(testPath, 'utf8');
    // 1. 校验占位符
    const placeholderRegex = /\[(待填写|TODO|待补充|待定义|待完善|TBD)\]/i;
    if (placeholderRegex.test(archContent)) {
        process.stderr.write(`❌ 门禁拦截：arch.md 包含待填写占位符，严禁带病编码！\n`);
        process.exit(1);
    }
    if (placeholderRegex.test(testContent)) {
        process.stderr.write(`❌ 门禁拦截：test.md 包含待填写占位符，严禁带病编码！\n`);
        process.exit(1);
    }
    // ----------------------------------------------------
    // [NEW] APM 遥测热异常自动反哺只读检测与警告
    // ----------------------------------------------------
    const latestHotfixPath = (0, node_path_1.resolve)((0, state_1.mainRepoRoot)(), '.orch/contracts/latest-hotfix.json');
    if ((0, node_fs_1.existsSync)(latestHotfixPath)) {
        try {
            const rawHotfix = (0, node_fs_1.readFileSync)(latestHotfixPath, 'utf8');
            const hotfixData = JSON.parse(rawHotfix);
            const isHotfixPhase = state.phaseBranch.includes('hotfix') || state.featureName.includes('hotfix');
            if (isHotfixPhase && hotfixData.fatalStacktrace) {
                const stackFirstLine = hotfixData.fatalStacktrace.split('\n')[0].trim();
                const guardKey = `确认不触发: ${stackFirstLine.slice(0, 60)}`;
                if (!archContent.includes(guardKey)) {
                    process.stderr.write(`⚠️  [APM 遥测自愈警告] 检测到最新的生产运行时崩溃异常，但该特征尚未物理灌溉至 ${docsDir}/arch.md 的回归护栏中！\n` +
                        `   建议立即运行以下命令进行物理自愈热灌溉：\n` +
                        `   node orch-cli/dist/index.js telemetry-backfill --sub ${subNumber} --confirm\n\n`);
                }
            }
        }
        catch (err) {
            process.stderr.write(`⚠️ [APM遥测只读校验警告] 无法读取最新遥测异常: ${err.message}\n`);
        }
    }
    // 2. 提取契约三表
    let extracted;
    try {
        extracted = (0, state_1.parseArchContracts)(archContent);
    }
    catch (err) {
        process.stderr.write(`❌ 门禁拦截：契约文件结构损坏，${err.message}\n`);
        process.exit(1);
    }
    if (extracted.whitelist.length === 0) {
        process.stderr.write(`❌ 门禁拦截：架构契约「文件白名单」为空，请在编码前先界定允许修改的文件！\n`);
        process.exit(1);
    }
    if (extracted.regressionGuards.length === 0) {
        process.stderr.write(`❌ 门禁拦截：架构契约「回归护栏」为空，必须指定具体的既有回归用例或手动验证路径！\n`);
        process.exit(1);
    }
    // 3. 校验 NFR / 可观测性三表存在性
    if (!archContent.includes('[契约] 可观测性三表') && !archContent.includes('可观测性三表')) {
        process.stderr.write(`⚠️ [P1 警告] arch.md 缺少 #### [契约] 可观测性三表 (缺少结构化日志脱敏与打桩规格)！\n`);
    }
    // ----------------------------------------------------
    // 数据库迁移安全拦截 (Migration Check - P0)
    // ----------------------------------------------------
    if (config.migrationCheck === true) {
        const isDbMigration = archContent.includes('数据迁移与 Schema 契约') || archContent.includes('[契约] 数据迁移');
        if (isDbMigration) {
            const migrationDir = (0, node_path_1.resolve)((0, state_1.mainRepoRoot)(), 'db/migrations');
            let upDownMatched = false;
            if ((0, node_fs_1.existsSync)(migrationDir)) {
                try {
                    const files = (0, node_fs_1.readdirSync)(migrationDir);
                    const upFiles = files.filter(f => f.endsWith('_up.sql') || f.endsWith('.up.sql'));
                    const downFiles = files.filter(f => f.endsWith('_down.sql') || f.endsWith('.down.sql'));
                    if (upFiles.length > 0 && upFiles.length === downFiles.length) {
                        upDownMatched = true;
                    }
                }
                catch {
                    // ignore
                }
            }
            if (!upDownMatched) {
                process.stderr.write(`❌ [P0 阻断] 数据库迁移任务未通过！已检测到 Schema 变更，但在 db/migrations/ 下未成对提供 _up.sql 与 _down.sql 物理回滚脚本！\n`);
                process.exit(1);
            }
        }
    }
    // 4. 校验 Git 分支与 worktree 状态
    let currentBranch;
    try {
        currentBranch = (0, node_child_process_1.execFileSync)('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    }
    catch (err) {
        process.stderr.write(`❌ 门禁拦截：Git 环境异常，${err.message}\n`);
        process.exit(1);
    }
    if (!currentBranch.startsWith('sub-')) {
        process.stderr.write(`❌ 门禁拦截：当前分支 ${currentBranch} 不是 sub- 分支，无法安全编码。\n`);
        process.exit(1);
    }
    // 5. 所有门禁通过后，写入 .precheck-done 握手标记
    try {
        const worktreeRoot = (0, node_child_process_1.execFileSync)('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
        const markerPath = (0, node_path_1.resolve)(worktreeRoot, '.precheck-done');
        (0, node_fs_1.writeFileSync)(markerPath, archPath + '\n', { encoding: 'utf8' });
    }
    catch (err) {
        process.stderr.write(`⚠️ [precheck 警告] 写入 .precheck-done 标记失败，hook 白名单将无法激活：${err.message}\n`);
    }
    // 所有门禁均完美通过！
    process.stdout.write(JSON.stringify({
        ok: true,
        passed: true,
        docsDir,
        branch: currentBranch,
        whitelistCount: extracted.whitelist.length,
        guardCount: extracted.regressionGuards.length,
        hint: `🎉 编码前全生命周期 precheck 门禁全部通过！[Intake ➔ Probing ➔ ADR ➔ 并发锁 ➔ 三表 ➔ 数据库迁移] 全通过，允许编码！`,
    }) + '\n');
}
