"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const argv_1 = require("../lib/argv");
const state_1 = require("../lib/state");
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const subNumber = (0, argv_1.requireInt)(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
    const confirm = (0, argv_1.flag)(parsed, 'confirm');
    const dryRun = !confirm;
    let state;
    try {
        state = (0, state_1.loadState)();
    }
    catch (err) {
        process.stderr.write(`❌ 读取进度失败：${err.message}\n`);
        process.exit(1);
    }
    const latestHotfixPath = (0, node_path_1.resolve)((0, state_1.mainRepoRoot)(), '.orch/contracts/latest-hotfix.json');
    if (!(0, node_fs_1.existsSync)(latestHotfixPath)) {
        process.stdout.write(JSON.stringify({ ok: true, hint: '没有检测到最新的运行时异常 latest-hotfix.json，无需回灌。' }) + '\n');
        return;
    }
    // 校验 arch.md 路径
    const phaseBranch = state.phaseBranch;
    const m = phaseBranch.match(/^phase-(\d+)-/);
    if (!m) {
        process.stderr.write(`❌ 无法从 phaseBranch "${phaseBranch}" 解析 phase 编号\n`);
        process.exit(1);
    }
    const phaseNumber = parseInt(m[1], 10);
    const docsDir = `docs/${state.featureName}/phase-${phaseNumber}/${subNumber}`;
    const archPath = (0, node_path_1.resolve)(process.cwd(), docsDir, 'arch.md');
    if (!(0, node_fs_1.existsSync)(archPath)) {
        process.stderr.write(`❌ 架构锁定契约不存在：${archPath}\n请先生成 arch.md 契约文件。\n`);
        process.exit(1);
    }
    try {
        const rawHotfix = (0, node_fs_1.readFileSync)(latestHotfixPath, 'utf8');
        const hotfixData = JSON.parse(rawHotfix);
        const isHotfixPhase = state.phaseBranch.includes('hotfix') || state.featureName.includes('hotfix');
        if (!isHotfixPhase || !hotfixData.fatalStacktrace) {
            process.stdout.write(JSON.stringify({ ok: true, hint: '非 hotfix 场景或 fatalStacktrace 为空，无需回灌。' }) + '\n');
            return;
        }
        const archContent = (0, node_fs_1.readFileSync)(archPath, 'utf8');
        const stackFirstLine = hotfixData.fatalStacktrace.split('\n')[0].trim();
        const guardKey = `确认不触发: ${stackFirstLine.slice(0, 60)}`;
        if (archContent.includes(guardKey)) {
            process.stdout.write(JSON.stringify({ ok: true, hint: '该异常特征已存在于回归护栏中，无需重复回灌。' }) + '\n');
            return;
        }
        const newGuardLine = `\n| APM遥测自愈 | ${guardKey} | 必须通过 gate 且不再触发此 APM 遥测异常 |`;
        const matchTable = archContent.match(/(#### \[契约\] 回归护栏[\s\S]*?)(?=\n#+|\Z)/);
        if (!matchTable) {
            process.stderr.write(`❌ arch.md 缺少 #### [契约] 回归护栏 章节，无法回灌！\n`);
            process.exit(1);
        }
        const tableSection = matchTable[1].trim();
        const upgradedTableSection = tableSection + newGuardLine;
        const currentArchContent = archContent.replace(tableSection, upgradedTableSection);
        if (dryRun) {
            process.stdout.write(JSON.stringify({
                ok: true,
                dryRun: true,
                hint: `[Dry-Run] 发现最新运行时异常 "${stackFirstLine.slice(0, 40)}"，如需物理回灌至 arch.md，请使用 --confirm 参数。`,
                diff: newGuardLine.trim(),
            }) + '\n');
            return;
        }
        (0, node_fs_1.writeFileSync)(archPath, currentArchContent, 'utf8');
        process.stdout.write(JSON.stringify({
            ok: true,
            passed: true,
            hint: `🎉 [APM 物理自愈回灌成功] 已成功将生产异常特征回灌入 ${docsDir}/arch.md 的回归护栏表！`,
            diff: newGuardLine.trim(),
        }) + '\n');
    }
    catch (err) {
        process.stderr.write(`❌ 遥测自愈回灌失败: ${err.message}\n`);
        process.exit(1);
    }
}
