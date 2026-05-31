import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, requireInt, flag } from '../lib/argv';
import { loadState, parseArchContracts, mainRepoRoot } from '../lib/state';
import { loadConfig } from '../lib/config';
import { type ContractRegistry, type ActiveContract } from './contract-register';

interface ConflictDetail {
  file: string;
  type: 'whitelist_whitelist' | 'whitelist_frozen';
  collidingBranch: string;
  collidingSub: number;
}

/**
 * contract-check 子命令：碰撞校验当前 sub-issue 与全局并发契约的冲突
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
    process.stderr.write(`❌ 契约校验失败：${(err as Error).message}\n`);
    process.exit(1);
  }

  // 2. 判定门禁分级
  const gatePolicy = config.workflowGates?.contractCollision || 'block';
  if (gatePolicy === 'off') {
    process.stdout.write(JSON.stringify({ ok: true, passed: true, hint: '并发语义锁碰撞门禁已被配置关闭(off)，透明放行。' }) + '\n');
    return;
  }

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        hint: '[Dry-Run] 将对当前白名单文件进行跨分支并发冲突比对。',
      }) + '\n'
    );
    return;
  }

  // 3. 读取当前分支的 arch.md 契约
  const phaseBranch = state.phaseBranch;
  const phaseMatch = phaseBranch.match(/^phase-(\d+)-/);
  if (!phaseMatch) {
    process.stderr.write(`❌ 契约校验失败：无法从分支名 ${phaseBranch} 解析 Phase 编号\n`);
    process.exit(1);
  }
  const phaseNumber = parseInt(phaseMatch[1], 10);

  const archPath = resolve(
    process.cwd(),
    `docs/${state.featureName}/phase-${phaseNumber}/${subNumber}/arch.md`
  );

  if (!existsSync(archPath)) {
    process.stderr.write(`❌ 契约校验失败：契约文件不存在：${archPath}\n请确认已先产出 arch.md\n`);
    process.exit(1);
  }

  let contracts;
  try {
    const content = readFileSync(archPath, 'utf8');
    contracts = parseArchContracts(content);
  } catch (err) {
    process.stderr.write(`❌ 契约校验失败：解析当前契约失败，${(err as Error).message}\n`);
    process.exit(1);
  }

  // 4. 读取全局 registry
  const registryRelPath = config.contractRegistry?.path || '.orch/contracts/registry.json';
  const registryPath = resolve(mainRepoRoot(), registryRelPath);

  if (!existsSync(registryPath)) {
    // 无活跃契约，透明通过
    process.stdout.write(
      JSON.stringify({
        ok: true,
        passed: true,
        conflictCount: 0,
        hint: '🎉 未发现活跃契约看板，并发校验透明通过。',
      }) + '\n'
    );
    return;
  }

  let registry: ContractRegistry;
  try {
    const raw = readFileSync(registryPath, 'utf8');
    registry = JSON.parse(raw) as ContractRegistry;
  } catch {
    // 格式损坏则透明通过
    process.stdout.write(
      JSON.stringify({
        ok: true,
        passed: true,
        conflictCount: 0,
        hint: '⚠️ 全局契约看板读取失败或损坏，跳过校验放行。',
      }) + '\n'
    );
    return;
  }

  // 5. 碰撞比对
  const conflicts: ConflictDetail[] = [];
  const activeContracts = registry.activeContracts || [];

  for (const other of activeContracts) {
    // 排除自己（同个 sub-issue）
    if (other.subIssue === subNumber && other.phaseIssue === state.phaseIssue) {
      continue;
    }

    // 碰撞检测
    for (const myFile of contracts.whitelist) {
      // 冲突 A：我修改的文件被别人列为了“绝对冻结不准修改” (whitelist-frozen collision)
      if (other.frozen.some(f => myFile.startsWith(f) || f.startsWith(myFile))) {
        conflicts.push({
          file: myFile,
          type: 'whitelist_frozen',
          collidingBranch: `sub-${other.subIssue}`,
          collidingSub: other.subIssue,
        });
      }

      // 冲突 B：我修改的文件与别人同时试图大改的文件重合了 (whitelist-whitelist collision)
      if (other.whitelist.includes(myFile)) {
        conflicts.push({
          file: myFile,
          type: 'whitelist_whitelist',
          collidingBranch: `sub-${other.subIssue}`,
          collidingSub: other.subIssue,
        });
      }
    }
  }

  const passed = conflicts.length === 0;

  if (!passed) {
    const errorMsg = conflicts
      .map(
        c =>
          c.type === 'whitelist_frozen'
            ? `⚠️ 冲突：计划修改的 [${c.file}] 已被并发活跃分支 [${c.collidingBranch}] 列为「物理冻结表」，禁止强行重写！`
            : `⚠️ 冲突：计划修改的 [${c.file}] 与并发活跃分支 [${c.collidingBranch}] 的「文件白名单」发生了并发大改碰撞！`
      )
      .join('\n');

    if (gatePolicy === 'block') {
      process.stderr.write(`❌ 门禁拦截：并发语义锁碰撞检测失败 (P0 级严重冲突)！\n${errorMsg}\n请联系相关开发者重构契约，或将当前任务变更为串行推进。\n`);
      process.exit(1);
    } else if (gatePolicy === 'warn') {
      process.stdout.write(
        JSON.stringify({
          ok: true,
          passed: true,
          warning: true,
          conflictCount: conflicts.length,
          conflicts,
          hint: `⚠️ [P1 级碰撞告警] 并发冲突已捕获但已放行：\n${errorMsg}`,
        }) + '\n'
      );
      return;
    }
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      passed: true,
      conflictCount: 0,
      hint: '🎉 并发语义锁碰撞校验成功！未检测到任何并发多分支白名单与冻结表碰撞。',
    }) + '\n'
  );
}
