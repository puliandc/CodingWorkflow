"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const argv_1 = require("../lib/argv");
const config_1 = require("../lib/config");
const gh_1 = require("../lib/gh");
/**
 * debug-comment 子命令：将 Debug 报告评论到当前 sub-issue。
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const subNumber = (0, argv_1.requireInt)(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
    const reportRaw = (0, argv_1.requireString)(parsed, 'report', '缺少必需参数：--report <debug-report.md>');
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    let config;
    try {
        config = (0, config_1.loadConfig)();
    }
    catch (err) {
        process.stderr.write(`Debug 评论失败：${err.message}\n`);
        process.exit(1);
    }
    const reportPath = (0, node_path_1.resolve)(process.cwd(), reportRaw);
    if (!(0, node_fs_1.existsSync)(reportPath)) {
        process.stderr.write(`Debug 评论失败：报告不存在：${reportPath}\n`);
        process.exit(1);
    }
    let body;
    try {
        body = (0, node_fs_1.readFileSync)(reportPath, 'utf8');
    }
    catch (err) {
        process.stderr.write(`Debug 评论失败：无法读取报告：${err.message}\n`);
        process.exit(1);
    }
    if (dryRun) {
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            repo: config.repo,
            subIssue: subNumber,
            reportPath,
            bodyBytes: Buffer.byteLength(body, 'utf8'),
            hint: `将把 Debug 诊断报告评论到 ${config.repo} issue #${subNumber}`,
        }) + '\n');
        return;
    }
    try {
        (0, gh_1.gh)(['issue', 'comment', String(subNumber), '--body-file', reportPath], undefined, false, { repo: config.repo });
    }
    catch (err) {
        process.stderr.write(`Debug 评论失败：${err.message}\n`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify({
        ok: true,
        repo: config.repo,
        subIssue: subNumber,
        reportPath,
        hint: `已将 Debug 诊断报告评论到 sub-issue #${subNumber}`,
    }) + '\n');
}
