"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const argv_1 = require("../lib/argv");
const config_1 = require("../lib/config");
const architecture_docs_1 = require("../lib/architecture-docs");
/**
 * architecture-docs-check 子命令
 * 根据变更文件和 docs/architecture/maintenance-map.json 判定是否需要维护全局架构文档。
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const phaseIssue = (0, argv_1.requireInt)(parsed, 'phase-issue', '缺少必需参数：--phase-issue <Phase issue 编号>');
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    const changedFiles = (0, architecture_docs_1.changedFilesFromArg)((0, argv_1.optionalString)(parsed, 'changed-files'));
    const baseRef = (0, argv_1.optionalString)(parsed, 'base-ref');
    let config;
    try {
        config = (0, config_1.loadConfig)();
    }
    catch (err) {
        process.stderr.write(`❌ 架构文档检查失败：${err.message}\n`);
        process.exit(1);
    }
    try {
        const result = (0, architecture_docs_1.evaluateArchitectureDocsCheck)({
            config,
            phaseIssue,
            dryRun,
            changedFiles,
            baseRef,
        });
        process.stdout.write(JSON.stringify(result) + '\n');
    }
    catch (err) {
        process.stderr.write(`❌ 架构文档检查失败：${err.message}\n`);
        process.exit(1);
    }
}
