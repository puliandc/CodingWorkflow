"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const node_child_process_1 = require("node:child_process");
const argv_1 = require("../lib/argv");
const config_1 = require("../lib/config");
/**
 * gate 命令：执行 lint/format/test 命令，并严格执行三硬判定防止伪绿自欺
 * 三硬判定：无错误关键词 ∧ 命中 successString ∧ exit 0
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const subNumber = (0, argv_1.requireInt)(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    const config = (0, config_1.loadConfig)();
    const cmds = config.commands || {};
    const verdict = config.greenVerdict || {};
    if (dryRun) {
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            hint: '将依次运行配置中的 lint/format/test 命令，执行真绿三硬判定。',
        }) + '\n');
        return;
    }
    // 待执行的命令列表
    const runList = [
        { type: 'lint', cmd: cmds.lint },
        { type: 'format', cmd: cmds.format },
        { type: 'test', cmd: cmds.test },
    ].filter(item => item.cmd);
    if (runList.length === 0) {
        process.stdout.write(JSON.stringify({
            ok: true,
            passed: true,
            hint: '项目未配置任何校验命令，默认真绿 PASS',
        }) + '\n');
        return;
    }
    const reports = [];
    let allPass = true;
    for (const item of runList) {
        const cmd = item.cmd;
        let stdout = '';
        let stderr = '';
        let exitCode = 0;
        try {
            // 执行外部校验命令并捕获完整输出
            const output = (0, node_child_process_1.execSync)(cmd, { encoding: 'utf8', stdio: 'pipe' });
            stdout = output || '';
        }
        catch (err) {
            stdout = err.stdout || '';
            stderr = err.stderr || '';
            exitCode = err.status ?? 1;
        }
        const fullOutput = stdout + '\n' + stderr;
        // 判定 1: exit 0
        const codePass = exitCode === 0;
        // 判定 2: successString 命中
        let successPass = true;
        if (verdict.successString) {
            successPass = fullOutput.includes(verdict.successString);
        }
        // 判定 3: errorKeywords 未命中
        let noErrors = true;
        const hitKeywords = [];
        if (verdict.errorKeywords && Array.isArray(verdict.errorKeywords)) {
            for (const kw of verdict.errorKeywords) {
                if (fullOutput.includes(kw)) {
                    noErrors = false;
                    hitKeywords.push(kw);
                }
            }
        }
        const itemPassed = codePass && successPass && noErrors;
        if (!itemPassed) {
            allPass = false;
        }
        reports.push({
            type: item.type,
            command: cmd,
            exitCode,
            codePass,
            successPass,
            noErrors,
            hitKeywords,
            passed: itemPassed,
        });
    }
    if (allPass) {
        process.stdout.write(JSON.stringify({
            ok: true,
            passed: true,
            reports,
            hint: '🎉 真绿门禁通过！所有的 Linter/Formatter/Tests 均符合 [退出码0 ∧ 包含成功串 ∧ 无错误关键词] 三硬标准！',
        }) + '\n');
    }
    else {
        process.stderr.write(`❌ 伪绿拦截！校验命令未通过三硬判定标准。详细报告：\n` +
            JSON.stringify({ ok: false, passed: false, reports }, null, 2) + '\n');
        process.exit(1);
    }
}
