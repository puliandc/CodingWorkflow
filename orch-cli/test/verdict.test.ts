/**
 * 回归测试：parseVerdict（来自 lib/verdict.ts）
 * 覆盖：合法 block/pass/warn → ok / 无 VERDICT 块 → null /
 *       非法 JSON → invalid / 缺 verdict 字段 → invalid / 枚举非法 → invalid
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseVerdict } from '../lib/verdict';

// ── 辅助：把 JSON 对象嵌入 VERDICT 注释块 ──────────────────────────────────
function wrap(json: string): string {
  return `# 报告\n\n内容在此。\n\n<!-- VERDICT\n${json}\n-->`;
}

// ── 测试套件 ────────────────────────────────────────────────────────────────

describe('parseVerdict', () => {
  // 合法枚举值测试
  for (const v of ['block', 'pass', 'warn'] as const) {
    it(`verdict="${v}" → { status:'ok', verdict.verdict:'${v}' }`, () => {
      const content = wrap(JSON.stringify({ verdict: v, gate: 'chaos', severity: 'P1' }));
      const result = parseVerdict(content);
      assert.notEqual(result, null);
      assert.equal((result as any).status, 'ok');
      assert.equal((result as any).verdict.verdict, v);
    });
  }

  it('无 VERDICT 块 → null', () => {
    const content = '# 报告\n\n没有任何 VERDICT 注释。\n';
    const result = parseVerdict(content);
    assert.equal(result, null);
  });

  it('非法 JSON → { status:"invalid" }', () => {
    const content = wrap('{ "verdict": block }'); // 未加引号，非法 JSON
    const result = parseVerdict(content);
    assert.notEqual(result, null);
    assert.equal((result as any).status, 'invalid');
  });

  it('缺少 verdict 字段 → { status:"invalid" }', () => {
    const content = wrap(JSON.stringify({ gate: 'chaos', severity: 'P0' }));
    const result = parseVerdict(content);
    assert.notEqual(result, null);
    assert.equal((result as any).status, 'invalid');
  });

  it('verdict 枚举非法 → { status:"invalid" }', () => {
    const content = wrap(JSON.stringify({ verdict: 'unknown_value' }));
    const result = parseVerdict(content);
    assert.notEqual(result, null);
    assert.equal((result as any).status, 'invalid');
  });

  it('包含合法 findings 数组 → ok 且 findings 被保留', () => {
    const content = wrap(JSON.stringify({ verdict: 'warn', findings: ['issue-1', 'issue-2'] }));
    const result = parseVerdict(content) as any;
    assert.equal(result?.status, 'ok');
    assert.deepEqual(result?.verdict?.findings, ['issue-1', 'issue-2']);
  });

  it('findings 不是字符串数组 → invalid', () => {
    const content = wrap(JSON.stringify({ verdict: 'pass', findings: [1, 2] }));
    const result = parseVerdict(content);
    assert.equal((result as any).status, 'invalid');
  });
});
