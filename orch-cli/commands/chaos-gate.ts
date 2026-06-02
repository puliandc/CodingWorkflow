import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, requireInt, flag } from '../lib/argv';
import { loadState, mainRepoRoot } from '../lib/state';
import { loadConfig } from '../lib/config';
import { parseVerdict } from '../lib/verdict';

/**
 * chaos-gate 子命令：审计并门禁混沌红蓝对抗验证报告
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const subNumber = requireInt(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
  const dryRun = flag(parsed, 'dry-run');

  // 1. 加载配置与状态
  let config;
  let state;
  try {
    config = loadConfig();
    state = loadState();
  } catch (err) {
    process.stderr.write(`❌ 混沌门禁校验失败：${(err as Error).message}\n`);
    process.exit(1);
  }

  const gates = config.workflowGates || {};
  const chaosPolicy = gates.chaos || 'block';

  if (chaosPolicy === 'off') {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        passed: true,
        hint: '🎉 混沌防御门禁已被配置关闭(off)，透明放行。',
      }) + '\n'
    );
    return;
  }

  const reportPath = resolve(mainRepoRoot(), `docs/test/chaos-report-${subNumber}.md`);

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        reportPath,
        hint: `[Dry-Run] 将审计混沌对抗报告是否存在，并正则检查 P0 级严重异常风险。`,
      }) + '\n'
    );
    return;
  }

  // 2. 检查报告是否存在
  if (!existsSync(reportPath)) {
    const errorMsg = `❌ 混沌门禁拦截：尚未进行红蓝对抗混沌测试！找不到报告：docs/test/chaos-report-${subNumber}.md\n`;
    if (chaosPolicy === 'block') {
      process.stderr.write(errorMsg);
      process.exit(1);
    } else {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          passed: true,
          warning: true,
          hint: `⚠️ [P1 警告] ${errorMsg}`,
        }) + '\n'
      );
      return;
    }
  }

  // 3. 审计报告内容
  const content = readFileSync(reportPath, 'utf8');

  // 优先消费结构化 VERDICT 块
  const verdictResult = parseVerdict(content);

  if (verdictResult !== null) {
    // 找到了 VERDICT 块（合法或非法）
    if (verdictResult.status === 'invalid') {
      // VERDICT 块存在但非法 → 门禁必须失败，绝不放行
      const errorMsg = `❌ 混沌门禁拦截：docs/test/chaos-report-${subNumber}.md 含有非法 VERDICT 块，无法解析裁决——${verdictResult.reason}\n`;
      process.stderr.write(errorMsg + '请修正报告中的 VERDICT 块后重试！\n');
      process.exit(1);
    }

    // verdictResult.status === 'ok'
    const { verdict } = verdictResult.verdict;

    if (verdict === 'block') {
      const findings = verdictResult.verdict.findings?.join('；') ?? '';
      const errorMsg = `❌ 门禁拦截：docs/test/chaos-report-${subNumber}.md VERDICT=block，发现未修复的混沌脆弱面！${findings ? `\n  发现项：${findings}` : ''}\n`;
      if (chaosPolicy === 'block') {
        process.stderr.write(errorMsg + '请修改代码补齐回退方案后重试！\n');
        process.exit(1);
      } else {
        process.stdout.write(
          JSON.stringify({
            ok: true,
            passed: true,
            warning: true,
            hint: `⚠️ [P1 警告] ${errorMsg}`,
          }) + '\n'
        );
        return;
      }
    }

    if (verdict === 'warn') {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          passed: true,
          warning: true,
          hint: `⚠️ [P1 警告] docs/test/chaos-report-${subNumber}.md VERDICT=warn，存在混沌隐患，建议优化后合入。`,
        }) + '\n'
      );
      return;
    }

    // verdict === 'pass'
    process.stdout.write(
      JSON.stringify({
        ok: true,
        passed: true,
        hint: '🎉 混沌防线与红蓝对抗校验通过（VERDICT=pass）！代码结构具备良好的负向抗压健壮性。',
      }) + '\n'
    );
    return;
  }

  // 无 VERDICT 块 → 兜底：回退现有文本匹配逻辑（向后兼容）
  const hasP0Conflict = content.includes('P0 阻断') || content.includes('CRITICAL 致命高危');

  if (hasP0Conflict) {
    const errorMsg = `❌ 门禁拦截：docs/test/chaos-report-${subNumber}.md 发现了未修复的 P0 级混沌脆弱面（如严重异常吞噬或超时 Fallback 缺失）！\n`;
    if (chaosPolicy === 'block') {
      process.stderr.write(errorMsg + '请修改代码补齐回退方案后重试！\n');
      process.exit(1);
    } else {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          passed: true,
          warning: true,
          hint: `⚠️ [P1 警告] ${errorMsg}`,
        }) + '\n'
      );
      return;
    }
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      passed: true,
      hint: '🎉 混沌防线与红蓝对抗校验通过！代码结构具备良好的负向抗压健壮性。',
    }) + '\n'
  );
}
