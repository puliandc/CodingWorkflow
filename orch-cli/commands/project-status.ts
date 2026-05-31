/**
 * project-status 命令
 * 设置 GitHub Project #2 看板上某 issue 的 Status 字段
 * 替换 orch.md L260-297 的 GraphQL 代码块
 *
 * 用法：tsx scripts/orch-cli/index.ts project-status --issue <N> --status <Todo|"In progress"|Done> [--dry-run]
 */

import { gh } from '../lib/gh';
import { parseArgs, requireInt, requireString, flag } from '../lib/argv';
import {
  PROJECT_ID,
  STATUS_FIELD_ID,
  STATUS_OPTIONS,
  REPO,
  PROJECT_NUMBER,
  OWNER,
  type StatusOption,
} from '../lib/constants';

/**
 * 确保 issue 已在 Project #2 中（幂等操作，已存在不报错）
 * @param issueNumber issue 编号
 * @param dryRun 是否 dry-run 模式
 */
function ensureInProject(issueNumber: number, dryRun: boolean): void {
  const issueUrl = `https://github.com/${REPO}/issues/${issueNumber}`;
  try {
    gh(
      ['project', 'item-add', String(PROJECT_NUMBER), '--owner', OWNER, '--url', issueUrl],
      undefined,
      dryRun
    );
  } catch {
    // 已存在则忽略错误（幂等）
  }
}

/**
 * 获取 issue 在 Project V2 中的 item ID
 * @param issueNumber issue 编号
 * @param dryRun 是否 dry-run 模式
 * @returns item ID 字符串
 */
function getProjectItemId(issueNumber: number, dryRun: boolean): string {
  // 先获取 issue node_id
  const itemNode = gh(
    ['api', `repos/${REPO}/issues/${issueNumber}`, '--jq', '.node_id'],
    undefined,
    dryRun
  );

  if (dryRun) return '<ITEM_NODE>';

  // 通过 GraphQL 查询该 issue 在 project 中的 item ID
  const query = `query { node(id: "${itemNode}") { ... on Issue { projectItems(first: 5) { nodes { id } } } } }`;
  const result = gh(['api', 'graphql', '-f', `query=${query}`]);

  let parsed: { data?: { node?: { projectItems?: { nodes?: Array<{ id: string }> } } } };
  try {
    parsed = JSON.parse(result);
  } catch {
    throw new Error(`GraphQL 响应解析失败：${result}`);
  }

  const items = parsed.data?.node?.projectItems?.nodes;
  if (!items || items.length === 0) {
    throw new Error(`issue #${issueNumber} 不在 Project #${PROJECT_NUMBER} 中，请先调用 project-status 前确认 issue 已加入项目`);
  }

  return items[0].id;
}

/**
 * 执行 project-status 命令
 * @param args 命令行参数数组
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const issueNumber = requireInt(parsed, 'issue', '缺少必需参数：--issue <issue 编号>');
  const statusRaw = requireString(parsed, 'status', '缺少必需参数：--status <Todo|"In progress"|Done>');
  const dryRun = flag(parsed, 'dry-run');

  // 校验 status 值
  const optionId = STATUS_OPTIONS[statusRaw];
  if (!optionId) {
    const validValues = Object.keys(STATUS_OPTIONS).join(' | ');
    process.stderr.write(`无效的 status 值："${statusRaw}"，有效值：${validValues}\n`);
    process.exit(1);
  }

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        steps: [
          `gh project item-add ${PROJECT_NUMBER} --owner ${OWNER} --url https://github.com/${REPO}/issues/${issueNumber}`,
          `gh api repos/${REPO}/issues/${issueNumber} --jq .node_id`,
          `gh api graphql -f query="query { node(id: \\"<ITEM_NODE>\\") { ... on Issue { projectItems(first: 5) { nodes { id } } } } }"`,
          `gh api graphql -f query="mutation { updateProjectV2ItemFieldValue(input: { projectId: \\"${PROJECT_ID}\\", itemId: \\"<ITEM_ID>\\", fieldId: \\"${STATUS_FIELD_ID}\\", value: { singleSelectOptionId: \\"${optionId}\\" } }) { projectV2Item { id } } }"`,
        ],
        hint: `将 issue #${issueNumber} 的 Status 设为 "${statusRaw}"`,
      }) + '\n'
    );
    return;
  }

  // 确保 issue 在项目中
  ensureInProject(issueNumber, false);

  // 获取 project item ID
  let itemId: string;
  try {
    itemId = getProjectItemId(issueNumber, false);
  } catch (err) {
    process.stderr.write((err as Error).message + '\n');
    process.exit(1);
  }

  // 更新 Status 字段
  const mutation = `mutation { updateProjectV2ItemFieldValue(input: { projectId: "${PROJECT_ID}", itemId: "${itemId}", fieldId: "${STATUS_FIELD_ID}", value: { singleSelectOptionId: "${optionId}" } }) { projectV2Item { id } } }`;
  const result = gh(['api', 'graphql', '-f', `query=${mutation}`]);

  let parsed2: { data?: { updateProjectV2ItemFieldValue?: { projectV2Item?: { id: string } } } };
  try {
    parsed2 = JSON.parse(result);
  } catch {
    process.stderr.write(`GraphQL 响应解析失败：${result}\n`);
    process.exit(1);
  }

  const updatedId = parsed2.data?.updateProjectV2ItemFieldValue?.projectV2Item?.id;
  if (!updatedId) {
    process.stderr.write(`更新 Status 失败，响应：${result}\n`);
    process.exit(1);
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      issue: issueNumber,
      status: statusRaw as StatusOption,
      itemId: updatedId,
      hint: `已将 issue #${issueNumber} 的 Status 设为 "${statusRaw}"`,
    }) + '\n'
  );
}
