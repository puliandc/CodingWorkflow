"use strict";
/**
 * issue-link-sub 命令
 * 通过 GraphQL addSubIssue 建立父子 issue 关系
 * 替换 orch.md L87-92 的 GraphQL 代码块
 *
 * 用法：tsx scripts/orch-cli/index.ts issue-link-sub --parent <N> --child <N> [--dry-run]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const gh_1 = require("../lib/gh");
const argv_1 = require("../lib/argv");
const constants_1 = require("../lib/constants");
/**
 * 获取 issue 的 GraphQL node_id
 * @param issueNumber issue 编号
 * @param dryRun 是否 dry-run 模式
 * @returns node_id 字符串
 */
function getNodeId(issueNumber, dryRun) {
    return (0, gh_1.gh)(['api', `repos/${constants_1.REPO}/issues/${issueNumber}`, '--jq', '.node_id'], undefined, dryRun);
}
/**
 * 执行 issue-link-sub 命令
 * @param args 命令行参数数组
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const parent = (0, argv_1.requireInt)(parsed, 'parent', '缺少必需参数：--parent <父 issue 编号>');
    const child = (0, argv_1.requireInt)(parsed, 'child', '缺少必需参数：--child <子 issue 编号>');
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    if (dryRun) {
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            steps: [
                `gh api repos/${constants_1.REPO}/issues/${parent} --jq .node_id`,
                `gh api repos/${constants_1.REPO}/issues/${child} --jq .node_id`,
                `gh api graphql -f query="mutation { addSubIssue(input: { issueId: \\"<PARENT_ID>\\", subIssueId: \\"<CHILD_ID>\\" }) { issue { number } subIssue { number } } }"`,
            ],
            hint: `将 issue #${child} 设为 issue #${parent} 的子 issue`,
        }) + '\n');
        return;
    }
    // 获取父子 issue 的 node_id
    const parentId = getNodeId(parent, false);
    const childId = getNodeId(child, false);
    if (!parentId) {
        process.stderr.write(`无法获取父 issue #${parent} 的 node_id\n`);
        process.exit(1);
    }
    if (!childId) {
        process.stderr.write(`无法获取子 issue #${child} 的 node_id\n`);
        process.exit(1);
    }
    // 执行 GraphQL addSubIssue mutation
    const mutation = `mutation { addSubIssue(input: { issueId: "${parentId}", subIssueId: "${childId}" }) { issue { number } subIssue { number } } }`;
    const result = (0, gh_1.gh)(['api', 'graphql', '-f', `query=${mutation}`]);
    let parsed2;
    try {
        parsed2 = JSON.parse(result);
    }
    catch {
        process.stderr.write(`GraphQL 响应解析失败：${result}\n`);
        process.exit(1);
    }
    const data = parsed2.data?.addSubIssue;
    if (!data) {
        process.stderr.write(`addSubIssue 返回结构异常：${result}\n`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify({
        ok: true,
        parent: data.issue?.number ?? parent,
        child: data.subIssue?.number ?? child,
        hint: `已将 issue #${child} 设为 issue #${parent} 的子 issue`,
    }) + '\n');
}
