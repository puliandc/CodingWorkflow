"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const argv_1 = require("../lib/argv");
const debug_1 = require("../lib/debug");
const state_1 = require("../lib/state");
/**
 * debug-allow-temp-log 子命令：登记 Debug 期间允许越过 arch 白名单补临时日志的文件。
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const subNumber = (0, argv_1.requireInt)(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
    const inputPath = (0, argv_1.requireString)(parsed, 'path', '缺少必需参数：--path <relative-file>');
    const reason = (0, argv_1.optionalString)(parsed, 'reason') ?? 'Debug 临时诊断日志';
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    const root = (0, state_1.currentWorktreeRoot)();
    let relPath;
    try {
        relPath = (0, debug_1.normalizeRelativePath)(inputPath, root);
    }
    catch (err) {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    }
    const manifestPath = (0, debug_1.debugManifestPath)(root);
    const entry = {
        sub: subNumber,
        path: relPath,
        reason,
        createdAt: new Date().toISOString(),
    };
    if (dryRun) {
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            manifestPath,
            willAllow: entry,
            requiredMarker: `ORCH_DEBUG_TEMP:${subNumber}:<attempt>`,
            hint: '将登记 Debug 临时日志白名单外写入授权；实际日志仍必须包含 ORCH_DEBUG_TEMP 标记。',
        }) + '\n');
        return;
    }
    let manifest;
    try {
        manifest = (0, debug_1.loadDebugTempLogManifest)(root);
    }
    catch (err) {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    }
    const existingIndex = manifest.entries.findIndex(e => e.sub === subNumber && e.path === relPath);
    if (existingIndex >= 0) {
        manifest.entries[existingIndex] = entry;
    }
    else {
        manifest.entries.push(entry);
    }
    try {
        (0, debug_1.saveDebugTempLogManifest)(manifest, root);
    }
    catch (err) {
        process.stderr.write(`无法写入 Debug 临时日志清单：${err.message}\n`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify({
        ok: true,
        manifestPath,
        allowed: entry,
        requiredMarker: `ORCH_DEBUG_TEMP:${subNumber}:<attempt>`,
        hint: `已允许 Debug 在 ${relPath} 补临时诊断日志；日志必须带 ORCH_DEBUG_TEMP:${subNumber}:<attempt> 标记，修复后必须清理。`,
    }) + '\n');
}
