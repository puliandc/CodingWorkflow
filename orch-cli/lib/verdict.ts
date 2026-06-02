/**
 * verdict.ts — 共享裁决解析器
 *
 * 约定：报告 Markdown 末尾嵌入如下 HTML 注释块：
 *
 *   <!-- VERDICT
 *   {"gate":"chaos","verdict":"block|pass|warn","severity":"P0|P1|P2","findings":["..."]}
 *   -->
 *
 * API：
 *   parseVerdict(content)
 *     返回 ParseResult：
 *       - null                        → 报告中未找到 VERDICT 块（兜底回退）
 *       - { status: 'ok', verdict }   → 合法裁决
 *       - { status: 'invalid', reason } → VERDICT 块存在但非法（调用方应让门禁失败）
 */

/** 裁决字段类型 */
export type VerdictValue = 'block' | 'pass' | 'warn';

/** 结构化裁决对象 */
export interface Verdict {
  verdict: VerdictValue;
  gate?: string;
  severity?: string;
  findings?: string[];
}

/** parseVerdict 返回类型 */
export type ParseResult =
  | null
  | { status: 'ok'; verdict: Verdict }
  | { status: 'invalid'; reason: string };

/** 合法的 verdict 枚举值 */
const VALID_VERDICTS: ReadonlySet<string> = new Set(['block', 'pass', 'warn']);

/**
 * 从报告 Markdown 中提取并解析 VERDICT 块。
 *
 * @param content 报告文件的完整文本内容
 * @returns
 *   - null                          若未找到 <!-- VERDICT ... --> 块
 *   - { status: 'ok', verdict }     若找到且合法
 *   - { status: 'invalid', reason } 若找到但 JSON 非法或字段校验失败
 */
export function parseVerdict(content: string): ParseResult {
  // 提取 <!-- VERDICT ... --> 之间的内容（允许多行，非贪婪）
  const match = content.match(/<!--\s*VERDICT\s*([\s\S]*?)\s*-->/);
  if (!match) {
    // 未找到 VERDICT 块 → 调用方应回退文本匹配
    return null;
  }

  const raw = match[1].trim();

  // 尝试 JSON.parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      status: 'invalid',
      reason: `VERDICT 块 JSON 解析失败：${(e as Error).message}`,
    };
  }

  // 必须是对象
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      status: 'invalid',
      reason: 'VERDICT 块必须是 JSON 对象',
    };
  }

  const obj = parsed as Record<string, unknown>;

  // 必填字段：verdict，且必须为合法枚举值
  if (!('verdict' in obj)) {
    return {
      status: 'invalid',
      reason: 'VERDICT 块缺少必填字段 "verdict"',
    };
  }

  const verdictVal = obj['verdict'];
  if (typeof verdictVal !== 'string' || !VALID_VERDICTS.has(verdictVal)) {
    return {
      status: 'invalid',
      reason: `VERDICT.verdict 值非法："${verdictVal}"，必须为 block | pass | warn`,
    };
  }

  // 可选字段类型宽校验（不强制存在，但若存在需是预期类型）
  if ('gate' in obj && typeof obj['gate'] !== 'string') {
    return { status: 'invalid', reason: 'VERDICT.gate 若存在，必须为字符串' };
  }
  if ('severity' in obj && typeof obj['severity'] !== 'string') {
    return { status: 'invalid', reason: 'VERDICT.severity 若存在，必须为字符串' };
  }
  if ('findings' in obj) {
    const f = obj['findings'];
    if (!Array.isArray(f) || f.some((item) => typeof item !== 'string')) {
      return { status: 'invalid', reason: 'VERDICT.findings 若存在，必须为字符串数组' };
    }
  }

  const verdict: Verdict = {
    verdict: verdictVal as VerdictValue,
    ...(typeof obj['gate'] === 'string' && { gate: obj['gate'] }),
    ...(typeof obj['severity'] === 'string' && { severity: obj['severity'] }),
    ...(Array.isArray(obj['findings']) && { findings: obj['findings'] as string[] }),
  };

  return { status: 'ok', verdict };
}
