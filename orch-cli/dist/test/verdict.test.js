"use strict";
/**
 * 回归测试：parseVerdict（来自 lib/verdict.ts）
 * 覆盖：合法 block/pass/warn → ok / 无 VERDICT 块 → null /
 *       非法 JSON → invalid / 缺 verdict 字段 → invalid / 枚举非法 → invalid
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const verdict_1 = require("../lib/verdict");
// ── 辅助：把 JSON 对象嵌入 VERDICT 注释块 ──────────────────────────────────
function wrap(json) {
    return `# 报告\n\n内容在此。\n\n<!-- VERDICT\n${json}\n-->`;
}
// ── 测试套件 ────────────────────────────────────────────────────────────────
(0, node_test_1.describe)('parseVerdict', () => {
    // 合法枚举值测试
    for (const v of ['block', 'pass', 'warn']) {
        (0, node_test_1.it)(`verdict="${v}" → { status:'ok', verdict.verdict:'${v}' }`, () => {
            const content = wrap(JSON.stringify({ verdict: v, gate: 'chaos', severity: 'P1' }));
            const result = (0, verdict_1.parseVerdict)(content);
            strict_1.default.notEqual(result, null);
            strict_1.default.equal(result.status, 'ok');
            strict_1.default.equal(result.verdict.verdict, v);
        });
    }
    (0, node_test_1.it)('无 VERDICT 块 → null', () => {
        const content = '# 报告\n\n没有任何 VERDICT 注释。\n';
        const result = (0, verdict_1.parseVerdict)(content);
        strict_1.default.equal(result, null);
    });
    (0, node_test_1.it)('非法 JSON → { status:"invalid" }', () => {
        const content = wrap('{ "verdict": block }'); // 未加引号，非法 JSON
        const result = (0, verdict_1.parseVerdict)(content);
        strict_1.default.notEqual(result, null);
        strict_1.default.equal(result.status, 'invalid');
    });
    (0, node_test_1.it)('缺少 verdict 字段 → { status:"invalid" }', () => {
        const content = wrap(JSON.stringify({ gate: 'chaos', severity: 'P0' }));
        const result = (0, verdict_1.parseVerdict)(content);
        strict_1.default.notEqual(result, null);
        strict_1.default.equal(result.status, 'invalid');
    });
    (0, node_test_1.it)('verdict 枚举非法 → { status:"invalid" }', () => {
        const content = wrap(JSON.stringify({ verdict: 'unknown_value' }));
        const result = (0, verdict_1.parseVerdict)(content);
        strict_1.default.notEqual(result, null);
        strict_1.default.equal(result.status, 'invalid');
    });
    (0, node_test_1.it)('包含合法 findings 数组 → ok 且 findings 被保留', () => {
        const content = wrap(JSON.stringify({ verdict: 'warn', findings: ['issue-1', 'issue-2'] }));
        const result = (0, verdict_1.parseVerdict)(content);
        strict_1.default.equal(result?.status, 'ok');
        strict_1.default.deepEqual(result?.verdict?.findings, ['issue-1', 'issue-2']);
    });
    (0, node_test_1.it)('findings 不是字符串数组 → invalid', () => {
        const content = wrap(JSON.stringify({ verdict: 'pass', findings: [1, 2] }));
        const result = (0, verdict_1.parseVerdict)(content);
        strict_1.default.equal(result.status, 'invalid');
    });
});
