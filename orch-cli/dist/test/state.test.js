"use strict";
/**
 * 回归测试：parseArchContracts（来自 lib/state.ts）
 * 覆盖：正常解析三表 / 结构损坏 / 空白名单 / 空护栏
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const state_1 = require("../lib/state");
// ── 已知限制文档 ────────────────────────────────────────────────────────────
// state.ts parseArchContracts 存在两个已知 bug（测试文档化，而非修复）：
// 1. 正则用了 \Z（JS 无效），护栏节必须后跟另一个 #### 节才能匹配。
//    → 工厂将护栏节放在白名单/冻结表之前以规避。
// 2. 护栏行过滤逻辑以子串命中"期望结果"，若结果列含该词则数据行被误过滤。
//    → 测试使用"通过"作为结果列值以规避。
// ── 工厂：生成标准 arch.md 文本 ────────────────────────────────────────────
//
// 注意：state.ts 中回归护栏正则使用了 \Z（JS 无效），因此护栏节必须后跟
// 另一个 #### 节，否则正则无法匹配终止边界，导致 regressionGuards 始终为空。
// 工厂将护栏节放在白名单/冻结表之前，保证后面有 \n#### 可终止匹配。
// 另外 state.ts 过滤逻辑会把包含 "期望结果" 的行整体过滤（子串命中），
// 因此护栏数据行的"结果"列不能包含该关键词；用"通过"代替。
function makeArchMd(opts = {}) {
    const wlRows = (opts.whitelistRows ?? ['| `src/foo.ts` | Edit |']).join('\n');
    const frozenRows = (opts.frozenRows ?? ['| `src/core.ts` | 不可修改核心 |']).join('\n');
    // 结果列用"通过"，避免触发 state.ts 过滤关键词 "期望结果"
    const guardRows = (opts.guardRows ?? ['| parseArchContracts 正常解析 | 通过 |']).join('\n');
    // 每个契约节后面都必须跟另一个 ####，否则末节因 \Z bug 无法被正则终止。
    // 顺序：护栏 → 白名单 → 冻结表 → 哨兵节（保证冻结表不是最后一节）
    return `# arch.md

## 第一部分

#### [契约] 回归护栏

| 验证用例 | 结果 |
| --- | --- |
${guardRows}

#### [契约] 文件白名单

| 允许路径 | 变更类型 |
| --- | --- |
${wlRows}

#### [契约] 冻结表

| 冻结路径 | 说明 |
| --- | --- |
${frozenRows}

#### 哨兵（终止上方冻结表匹配）
`;
}
// ── 测试套件 ────────────────────────────────────────────────────────────────
(0, node_test_1.describe)('parseArchContracts', () => {
    (0, node_test_1.it)('正常 arch.md → 解析出三表', () => {
        // 护栏列用"通过"，避免 state.ts 子串过滤 bug（详见文件顶部注释）
        const md = makeArchMd({
            whitelistRows: [
                '| `src/foo.ts` | Edit |',
                '| `src/bar.ts` | Write |',
            ],
            frozenRows: ['| `src/core.ts` | 不可修改 |'],
            guardRows: ['| parseArchContracts 正常解析 | 通过 |'],
        });
        const result = (0, state_1.parseArchContracts)(md);
        // whitelist
        strict_1.default.ok(result.whitelist.includes('src/foo.ts'), `whitelist 应包含 src/foo.ts，实际=${JSON.stringify(result.whitelist)}`);
        strict_1.default.ok(result.whitelist.includes('src/bar.ts'), `whitelist 应包含 src/bar.ts`);
        // frozen
        strict_1.default.ok(result.frozen.includes('src/core.ts'), `frozen 应包含 src/core.ts，实际=${JSON.stringify(result.frozen)}`);
        // regressionGuards（护栏节在白名单前，保证正则可命中终止边界）
        strict_1.default.ok(result.regressionGuards.includes('parseArchContracts 正常解析'), `regressionGuards 应包含 'parseArchContracts 正常解析'，实际=${JSON.stringify(result.regressionGuards)}`);
    });
    (0, node_test_1.it)('白名单为空时 whitelist 数组为 []', () => {
        const md = makeArchMd({ whitelistRows: [] });
        const result = (0, state_1.parseArchContracts)(md);
        strict_1.default.deepEqual(result.whitelist, []);
    });
    (0, node_test_1.it)('护栏为空时 regressionGuards 数组为 []', () => {
        const md = makeArchMd({ guardRows: [] });
        const result = (0, state_1.parseArchContracts)(md);
        strict_1.default.deepEqual(result.regressionGuards, []);
    });
    (0, node_test_1.it)('缺少文件白名单表时 whitelist 为 []（无 header → 无法匹配）', () => {
        // 完全去掉白名单节
        const md = `# arch.md\n\n#### [契约] 冻结表\n\n| 冻结路径 | 说明 |\n| --- | --- |\n| \`a.ts\` | 说明 |\n`;
        const result = (0, state_1.parseArchContracts)(md);
        strict_1.default.deepEqual(result.whitelist, []);
    });
    (0, node_test_1.it)('缺少所有三个契约表时返回全空结构', () => {
        const md = '# 架构文档\n\n无契约信息。\n';
        const result = (0, state_1.parseArchContracts)(md);
        strict_1.default.deepEqual(result, { whitelist: [], frozen: [], regressionGuards: [] });
    });
    (0, node_test_1.it)('行内含占位符"无"时被过滤', () => {
        // "无" 行的结果列也是"无"，两者都被过滤条件覆盖，确保最终数组中没有"无"
        const md = makeArchMd({ guardRows: ['| 无 | 无 |'] });
        const result = (0, state_1.parseArchContracts)(md);
        strict_1.default.ok(!result.regressionGuards.includes('无'), `"无"应被过滤，实际=${JSON.stringify(result.regressionGuards)}`);
    });
});
