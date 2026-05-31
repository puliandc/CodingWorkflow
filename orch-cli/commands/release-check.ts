import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, requireInt, flag } from '../lib/argv';
import { loadState, mainRepoRoot } from '../lib/state';
import { loadConfig } from '../lib/config';

/**
 * release-check 子命令：审计生产部署与一键回退 Runbook
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const subNumber = requireInt(parsed, 'sub-issue', '缺少必需参数：--sub-issue <sub-issue 编号>');
  const dryRun = flag(parsed, 'dry-run');

  // 1. 加载配置与状态
  let config;
  let state;
  try {
    config = loadConfig();
    state = loadState();
  } catch (err) {
    process.stderr.write(`❌ 发布门禁校验失败：${(err as Error).message}\n`);
    process.exit(1);
  }

  const gates = config.workflowGates || {};
  const releasePolicy = gates.release || 'block';

  if (releasePolicy === 'off') {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        passed: true,
        hint: '🎉 发布回滚门禁已被配置关闭(off)，透明放行。',
      }) + '\n'
    );
    return;
  }

  const reportPath = resolve(mainRepoRoot(), `docs/release/release-plan-${subNumber}.md`);

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        reportPath,
        hint: `[Dry-Run] 将审计发布回滚计划 docs/release/release-plan-${subNumber}.md 是否健全。`,
      }) + '\n'
    );
    return;
  }

  // 2. 检查计划文件是否存在
  if (!existsSync(reportPath)) {
    const errorMsg = `❌ 发布门禁拦截：缺少发布 Runbook 文件 docs/release/release-plan-${subNumber}.md！\n`;
    if (releasePolicy === 'block') {
      process.stderr.write(errorMsg + '上线前的最后一公里必须有灰度与一键回退 Runbook 保障！\n');
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
  
  // 必须断言有 Feature Flag 描述
  if (!content.includes('Feature Flag') && !content.includes('FF_')) {
    const errorMsg = `❌ 发布门禁拦截：docs/release/release-plan-${subNumber}.md 缺失 Feature Flag 功能开关命名与灰度计划！\n`;
    if (releasePolicy === 'block') {
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

  // 必须包含物理一键回滚 Runbook 步骤
  if (!content.includes('一键物理回滚 Runbook') && !content.includes('Disaster Recovery')) {
    const errorMsg = `❌ 发布门禁拦截：docs/release/release-plan-${subNumber}.md 缺失「生产一键物理回滚 Runbook」关键救援章节！\n`;
    if (releasePolicy === 'block') {
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

  // 4. 若开启了 migrationCheck，且检测到 Migration，必须有 down.sql 或数据回滚 SQL 描述
  if (config.migrationCheck === true) {
    const phaseBranch = state.phaseBranch;
    const phaseMatch = phaseBranch.match(/^phase-(\d+)-/);
    if (phaseMatch) {
      const phaseNumber = parseInt(phaseMatch[1], 10);
      const archPath = resolve(
        process.cwd(),
        `docs/${state.featureName}/phase-${phaseNumber}/${subNumber}/arch.md`
      );
      if (existsSync(archPath)) {
        const archContent = readFileSync(archPath, 'utf8');
        const isDbMigration = archContent.includes('数据迁移与 Schema 契约') || archContent.includes('[契约] 数据迁移');
        if (isDbMigration) {
          if (!content.includes('数据回滚 SQL') && !content.includes('rollback') && !content.includes('down.sql')) {
            const errorMsg = `❌ [P0 阻断] 数据库迁移任务未通过！已登记 Schema 变更，但在 docs/release/release-plan-${subNumber}.md 物理 Runbook 中缺失「数据回滚与 Schema 补偿」物理 SQL 或命令！\n`;
            process.stderr.write(errorMsg);
            process.exit(1);
          }
        }
      }
    }
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      passed: true,
      hint: '🎉 部署发布与生产一键回退 Runbook 审计通过！FF/灰度/回滚机制完善，允许提单 PR。',
    }) + '\n'
  );
}
