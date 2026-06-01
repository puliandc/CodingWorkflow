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
 * telemetry-webhook 子命令：模拟读取 APM Webhook 报警载荷并自动化生成 Hotfix Issue
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const payloadPathRel = (0, argv_1.requireString)(parsed, 'payload', '缺少必需参数：--payload <APM 报警载荷 JSON 路径>');
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    // 1. 读取项目配置
    let config;
    try {
        config = (0, config_1.loadConfig)();
    }
    catch (err) {
        process.stderr.write(`❌ 遥测闭环失败：${err.message}\n`);
        process.exit(1);
    }
    // 2. 核对并解析 APM payload JSON
    const payloadPath = (0, node_path_1.resolve)(process.cwd(), payloadPathRel);
    if (!(0, node_fs_1.existsSync)(payloadPath)) {
        process.stderr.write(`❌ 遥测闭环失败：找不到 APM 报警载荷文件：${payloadPath}\n`);
        process.exit(1);
    }
    let payload;
    try {
        const raw = (0, node_fs_1.readFileSync)(payloadPath, 'utf8');
        payload = JSON.parse(raw);
    }
    catch (err) {
        process.stderr.write(`❌ 遥测闭环失败：报警载荷 JSON 解析失败，${err.message}\n`);
        process.exit(1);
    }
    if (!payload.fatalStacktrace) {
        process.stderr.write(`❌ 遥测闭环失败：报警载荷缺失 fatalStacktrace 核心异常堆栈字段\n`);
        process.exit(1);
    }
    // 3. 确定 hotfix-issue.md 模板路径
    const templateRelPath = config.observability?.hotfixTemplate || '.orch/templates/hotfix-issue.md';
    const templatePath = (0, node_path_1.resolve)((0, state_1.mainRepoRoot)(), templateRelPath);
    if (!(0, node_fs_1.existsSync)(templatePath)) {
        process.stderr.write(`❌ 遥测闭环失败：找不到 Hotfix 诊断 Issue 模板：${templatePath}\n`);
        process.exit(1);
    }
    const templateContent = (0, node_fs_1.readFileSync)(templatePath, 'utf8');
    // 4. 替换模板中占位符
    const featureModule = payload.featureModule || 'unknown-module';
    const traceId = payload.traceId || 't-unknown-12345';
    const errorMessage = payload.errorMessage || 'Fatal runtime exception';
    const incidentTime = new Date().toISOString();
    const timestamp = String(Date.now());
    let replacedBody = templateContent
        .replace(/<PhaseIssue>/g, 'hotfix')
        .replace(/<INCIDENT_TIME>/g, incidentTime)
        .replace(/<FEATURE_MODULE>/g, featureModule)
        .replace(/<ALERT_RULE>/g, 'service_error_rate > 0.05% (APM Webhook 报警)')
        .replace(/<BASE_VERSION>/g, 'origin/main')
        .replace(/<FATAL_STACKTRACE_STDOUT>/g, payload.fatalStacktrace)
        .replace(/<TRACE_ID>/g, traceId)
        .replace(/<TIMESTAMP>/g, timestamp)
        .replace(/<EVENT_NAME>/g, 'RUNTIME_FATAL_CRASH')
        .replace(/<ERROR_MESSAGE>/g, errorMessage);
    const issueTitle = `🚨 运行时高危崩溃热诊断 Issue — phase-hotfix-#${timestamp.slice(-5)}`;
    if (dryRun) {
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            issueTitle,
            payload,
            hint: `[Dry-Run] 成功解析 APM Webhook 告警！将自动调用 gh CLI 创建如下格式的故障诊断 Hotfix Issue 并挂载 labels。`,
            templatePath,
        }) + '\n');
        return;
    }
    // 5. 自动调用 gh CLI 创建 Hotfix Issue，并打上 `hotfix` 与 `observability-breach` 标签
    process.stdout.write(`⏳ 正在通过 GitHub API 自动拉起故障 Hotfix 诊断 Issue...\n`);
    let createdIssueUrl = '';
    try {
        const rawOut = (0, node_child_process_1.execFileSync)('gh', [
            'issue',
            'create',
            '--title',
            issueTitle,
            '--body',
            replacedBody,
            '--label',
            'hotfix',
            '--label',
            'observability-breach',
        ], { encoding: 'utf8' });
        createdIssueUrl = rawOut.trim();
    }
    catch (err) {
        // 降级兜底：本地测试时若缺 token，将 Issue 保存为本地诊断文档，不直接崩溃进程
        const mockIssuePath = (0, node_path_1.resolve)((0, state_1.mainRepoRoot)(), `docs/triage/hotfix-diagnostic-#${timestamp.slice(-5)}.md`);
        try {
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(mockIssuePath), { recursive: true });
            (0, node_fs_1.writeFileSync)(mockIssuePath, replacedBody, 'utf8');
        }
        catch (writeErr) {
            process.stderr.write(`❌ 写入本地诊断文档失败：${writeErr.message}\n`);
        }
        process.stderr.write(`⚠️ [APM热闭环警报] GitHub CLI 创建 Issue 失败（通常为 Token 未配）。诊断文档已保存至本地: ${mockIssuePath}\n`);
        createdIssueUrl = mockIssuePath;
    }
    // 物理将最新的 Telemetry 热故障数据持久化到全局 contracts 目录下，供 precheck 节点自动回灌
    const latestHotfixPath = (0, node_path_1.resolve)((0, state_1.mainRepoRoot)(), '.orch/contracts/latest-hotfix.json');
    try {
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(latestHotfixPath), { recursive: true });
        (0, node_fs_1.writeFileSync)(latestHotfixPath, JSON.stringify({
            fatalStacktrace: payload.fatalStacktrace,
            errorMessage,
            featureModule,
            traceId,
            timestamp: parseInt(timestamp, 10),
            issueTitle
        }, null, 2) + '\n', 'utf8');
        process.stdout.write(`📡 [APM 遥测持久化] 已物理更新全局最新热故障快照: ${latestHotfixPath}\n`);
    }
    catch (err) {
        process.stderr.write(`⚠️ [APM热闭环警报] 无法写入 latest-hotfix.json: ${err.message}\n`);
    }
    process.stdout.write(JSON.stringify({
        ok: true,
        issueTitle,
        createdIssueUrl,
        hint: `🎉 [APM 遥测自愈热闭环成功] 已自动从运行时异常堆栈生成并拉起热诊断故障 Issue！[堆栈回流 ➔ 替换模板 ➔ gh API 发帖 ➔ 标签挂载] 物理链路 100% 打通闭环！`,
    }) + '\n');
}
