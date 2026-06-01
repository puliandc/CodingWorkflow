"use strict";
/**
 * project-status 命令
 * 设置 GitHub Project #2 看板上某 issue 的 Status 字段
 * 替换 orch.md L260-297 的 GraphQL 代码块
 *
 * 用法：tsx scripts/orch-cli/index.ts project-status --issue <N> --status <Todo|"In progress"|Done> [--dry-run]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const gh_1 = require("../lib/gh");
const argv_1 = require("../lib/argv");
const constants_1 = require("../lib/constants");
/**
 * 确保 issue 已在 Project #2 中（幂等操作，已存在不报错）
 * @param issueNumber issue 编号
 * @param dryRun 是否 dry-run 模式
 */
function ensureInProject(issueNumber, dryRun) {
    const issueUrl = `https://github.com/${constants_1.REPO}/issues/${issueNumber}`;
    try {
        (0, gh_1.gh)(['project', 'item-add', String(constants_1.PROJECT_NUMBER), '--owner', constants_1.OWNER, '--url', issueUrl], undefined, dryRun);
    }
    catch {
        // 已存在则忽略错误（幂等）
    }
}
/**
 * 获取 issue 在 Project V2 中的 item ID
 * @param issueNumber issue 编号
 * @param dryRun 是否 dry-run 模式
 * @returns item ID 字符串
 */
function getProjectItemId(issueNumber, dryRun) {
    // 先获取 issue node_id
    const itemNode = (0, gh_1.gh)(['api', `repos/${constants_1.REPO}/issues/${issueNumber}`, '--jq', '.node_id'], undefined, dryRun);
    if (dryRun)
        return '<ITEM_NODE>';
    // 通过 GraphQL 查询该 issue 在 project 中的 item ID
    const query = `query { node(id: "${itemNode}") { ... on Issue { projectItems(first: 5) { nodes { id } } } } }`;
    const result = (0, gh_1.gh)(['api', 'graphql', '-f', `query=${query}`]);
    let parsed;
    try {
        parsed = JSON.parse(result);
    }
    catch {
        throw new Error(`GraphQL 响应解析失败：${result}`);
    }
    const items = parsed.data?.node?.projectItems?.nodes;
    if (!items || items.length === 0) {
        throw new Error(`issue #${issueNumber} 不在 Project #${constants_1.PROJECT_NUMBER} 中，请先调用 project-status 前确认 issue 已加入项目`);
    }
    return items[0].id;
}
/**
 * 执行 project-status 命令
 * @param args 命令行参数数组
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const issueNumber = (0, argv_1.requireInt)(parsed, 'issue', '缺少必需参数：--issue <issue 编号>');
    const statusRaw = (0, argv_1.requireString)(parsed, 'status', '缺少必需参数：--status <Todo|"In progress"|Done>');
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    // 校验 status 值
    const optionId = constants_1.STATUS_OPTIONS[statusRaw];
    if (!optionId) {
        const validValues = Object.keys(constants_1.STATUS_OPTIONS).join(' | ');
        process.stderr.write(`无效的 status 值："${statusRaw}"，有效值：${validValues}\n`);
        process.exit(1);
    }
    if (dryRun) {
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            steps: [
                `gh project item-add ${constants_1.PROJECT_NUMBER} --owner ${constants_1.OWNER} --url https://github.com/${constants_1.REPO}/issues/${issueNumber}`,
                `gh api repos/${constants_1.REPO}/issues/${issueNumber} --jq .node_id`,
                `gh api graphql -f query="query { node(id: \\"<ITEM_NODE>\\") { ... on Issue { projectItems(first: 5) { nodes { id } } } } }"`,
                `gh api graphql -f query="mutation { updateProjectV2ItemFieldValue(input: { projectId: \\"${constants_1.PROJECT_ID}\\", itemId: \\"<ITEM_ID>\\", fieldId: \\"${constants_1.STATUS_FIELD_ID}\\", value: { singleSelectOptionId: \\"${optionId}\\" } }) { projectV2Item { id } } }"`,
            ],
            hint: `将 issue #${issueNumber} 的 Status 设为 "${statusRaw}"`,
        }) + '\n');
        return;
    }
    // 确保 issue 在项目中
    ensureInProject(issueNumber, false);
    // 获取 project item ID
    let itemId;
    try {
        itemId = getProjectItemId(issueNumber, false);
    }
    catch (err) {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    }
    // 更新 Status 字段
    const mutation = `mutation { updateProjectV2ItemFieldValue(input: { projectId: "${constants_1.PROJECT_ID}", itemId: "${itemId}", fieldId: "${constants_1.STATUS_FIELD_ID}", value: { singleSelectOptionId: "${optionId}" } }) { projectV2Item { id } } }`;
    const result = (0, gh_1.gh)(['api', 'graphql', '-f', `query=${mutation}`]);
    let parsed2;
    try {
        parsed2 = JSON.parse(result);
    }
    catch {
        process.stderr.write(`GraphQL 响应解析失败：${result}\n`);
        process.exit(1);
    }
    const updatedId = parsed2.data?.updateProjectV2ItemFieldValue?.projectV2Item?.id;
    if (!updatedId) {
        process.stderr.write(`更新 Status 失败，响应：${result}\n`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify({
        ok: true,
        issue: issueNumber,
        status: statusRaw,
        itemId: updatedId,
        hint: `已将 issue #${issueNumber} 的 Status 设为 "${statusRaw}"`,
    }) + '\n');
}
