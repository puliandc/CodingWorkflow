import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, requireInt, flag } from '../lib/argv';
import { loadState, mainRepoRoot } from '../lib/state';
import { loadConfig } from '../lib/config';

/**
 * intake-check 子命令：校验需求入口准入是否合规
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const phaseIssue = requireInt(parsed, 'phase-issue', '缺少必需参数：--phase-issue <Phase issue 编号>');
  const dryRun = flag(parsed, 'dry-run');

  // 1. 加载配置与状态
  let config;
  let state;
  try {
    config = loadConfig();
    state = loadState();
  } catch (err) {
    process.stderr.write(`❌ 准入校验失败：${(err as Error).message}\n`);
    process.exit(1);
  }

  const gates = config.workflowGates || {};
  const intakePolicy = gates.intake || 'block';

  if (intakePolicy === 'off') {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        passed: true,
        hint: '🎉 准入校验门禁已被配置关闭(off)，透明放行。',
      }) + '\n'
    );
    return;
  }

  const intakePath = resolve(mainRepoRoot(), `docs/triage/intake-${phaseIssue}.md`);

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        intakePath,
        hint: `[Dry-Run] 将核对 docs/triage/intake-${phaseIssue}.md 存在性与 [NO-GO] 准入物理拦截。`,
      }) + '\n'
    );
    return;
  }

  // 2. 核对报告是否存在
  if (!existsSync(intakePath)) {
    const errorMsg = `❌ 准入拦截：找不到需求准入报告 docs/triage/intake-${phaseIssue}.md！\n`;
    if (intakePolicy === 'block') {
      process.stderr.write(errorMsg + '在拆分 sub-issue 前必须有 intake 报告完成 GO/NO-GO 审查！\n');
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

  // 3. 读取并解析报告内容
  const content = readFileSync(intakePath, 'utf8');
  const isNoGo = content.includes('[NO-GO]');

  if (isNoGo) {
    const errorMsg = `❌ 门禁拦截：需求准入报告 docs/triage/intake-${phaseIssue}.md 最终裁决为 [NO-GO] (不合格/无法执行)！\n`;
    if (intakePolicy === 'block') {
      process.stderr.write(errorMsg + '阻断立项推进！请重新梳理或人工关闭 Issue。\n');
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
      hint: '🎉 需求入口准入校验成功！需求符合可执行度，允许拆分 sub-issue 推进。',
    }) + '\n'
  );
}
