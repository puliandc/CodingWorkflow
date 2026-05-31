import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseArgs, requireInt, flag } from '../lib/argv';
import { loadState, parseArchContracts, mainRepoRoot } from '../lib/state';
import { loadConfig } from '../lib/config';

export interface ActiveContract {
  subIssue: number;
  branchName: string;
  phaseIssue: number;
  whitelist: string[];
  frozen: string[];
  timestamp: number;
}

export interface ContractRegistry {
  activeContracts: ActiveContract[];
}

/**
 * contract-register 子命令：登记当前 sub-issue 契约白名单和冻结表
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
    process.stderr.write(`❌ 注册契约失败：${(err as Error).message}\n`);
    process.exit(1);
  }

  // 2. 确定 arch.md 契约路径
  const phaseBranch = state.phaseBranch;
  const phaseMatch = phaseBranch.match(/^phase-(\d+)-/);
  if (!phaseMatch) {
    process.stderr.write(`❌ 注册契约失败：无法从分支名 ${phaseBranch} 解析 Phase 编号\n`);
    process.exit(1);
  }
  const phaseNumber = parseInt(phaseMatch[1], 10);

  const archPath = resolve(
    process.cwd(),
    `docs/${state.featureName}/phase-${phaseNumber}/${subNumber}/arch.md`
  );

  if (!existsSync(archPath)) {
    process.stderr.write(`❌ 注册契约失败：契约文件不存在，请先派发 arch agent：${archPath}\n`);
    process.exit(1);
  }

  // 3. 解析契约三表
  let contracts;
  try {
    const content = readFileSync(archPath, 'utf8');
    contracts = parseArchContracts(content);
  } catch (err) {
    process.stderr.write(`❌ 解析契约失败：${(err as Error).message}\n`);
    process.exit(1);
  }

  // 4. 定位并读取全局 registry
  const registryRelPath = config.contractRegistry?.path || '.orch/contracts/registry.json';
  const registryPath = resolve(mainRepoRoot(), registryRelPath);

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        subIssue: subNumber,
        whitelist: contracts.whitelist,
        frozen: contracts.frozen,
        registryPath,
        hint: `[Dry-Run] 将登记 sub-issue #${subNumber} 契约 (白名单: ${contracts.whitelist.length}项, 冻结: ${contracts.frozen.length}项)`,
      }) + '\n'
    );
    return;
  }

  // 读取或创建全局看板
  let registry: ContractRegistry = { activeContracts: [] };
  if (existsSync(registryPath)) {
    try {
      const raw = readFileSync(registryPath, 'utf8');
      registry = JSON.parse(raw) as ContractRegistry;
      if (!Array.isArray(registry.activeContracts)) {
        registry.activeContracts = [];
      }
    } catch {
      // 损坏时重置
      registry = { activeContracts: [] };
    }
  }

  // 移除该 sub-issue 已存的旧活跃记录（保持幂等）
  registry.activeContracts = registry.activeContracts.filter(
    c => !(c.subIssue === subNumber && c.phaseIssue === state.phaseIssue)
  );

  // 写入新纪录
  const newContract: ActiveContract = {
    subIssue: subNumber,
    branchName: `sub-${subNumber}`,
    phaseIssue: state.phaseIssue,
    whitelist: contracts.whitelist,
    frozen: contracts.frozen,
    timestamp: Date.now(),
  };

  registry.activeContracts.push(newContract);

  // 落盘保存
  try {
    mkdirSync(dirname(registryPath), { recursive: true });
    writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  } catch (err) {
    process.stderr.write(`❌ 全局契约看板写入失败：${(err as Error).message}\n`);
    process.exit(1);
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      subIssue: subNumber,
      whitelistCount: contracts.whitelist.length,
      frozenCount: contracts.frozen.length,
      registryFile: registryRelPath,
      hint: `🎉 成功将 sub-issue #${subNumber} 的契约注册至全局契约看板！[白名单: ${contracts.whitelist.length}项 ∧ 冻结表: ${contracts.frozen.length}项]`,
    }) + '\n'
  );
}
