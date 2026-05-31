import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, requireInt, flag } from '../lib/argv';
import { loadState, mainRepoRoot } from '../lib/state';
import { loadConfig } from '../lib/config';

interface CandidateRule {
  greenVerdict?: {
    errorKeywords?: string[];
  };
  whitelistEnforcePaths?: string[];
  preToolUseHooks?: Array<{
    pattern: string;
    explanation: string;
  }>;
}

/**
 * guardrail-compile 子命令：解析 retro.md 编译自进化规则 diff 或合入
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const phaseIssue = requireInt(parsed, 'phase-issue', '缺少必需参数：--phase-issue <Phase issue 编号>');
  const confirm = flag(parsed, 'confirm');
  const dryRun = !confirm; // 默认需显式指定 --confirm 才物理写入，否则一律 dry-run

  // 1. 加载状态与配置
  let config;
  let state;
  try {
    config = loadConfig();
    state = loadState();
  } catch (err) {
    process.stderr.write(`❌ 规则自愈编译器失败：${(err as Error).message}\n`);
    process.exit(1);
  }

  // 2. 确定并核对 retro 物理文件
  const retroPath = resolve(mainRepoRoot(), `docs/retro/retro-phase-${phaseIssue}.md`);
  if (!existsSync(retroPath)) {
    process.stderr.write(`❌ 规则自愈编译器失败：找不到 Retro 复盘报告 docs/retro/retro-phase-${phaseIssue}.md\n`);
    process.exit(1);
  }

  const retroContent = readFileSync(retroPath, 'utf8');

  // 3. 提取可编译 JSON 块
  const jsonMatch = retroContent.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  if (!jsonMatch) {
    process.stderr.write(`❌ 规则自愈编译器失败：Retro 报告中缺失 \`\`\`json 格式的候选规则章节！\n`);
    process.exit(1);
  }

  let candidate: CandidateRule;
  try {
    candidate = JSON.parse(jsonMatch[1]) as CandidateRule;
  } catch (err) {
    process.stderr.write(`❌ 规则自愈编译器失败：无法解析候选规则 JSON：${(err as Error).message}\n`);
    process.exit(1);
  }

  // 4. 读取当前 config.json
  const configPath = resolve(mainRepoRoot(), '.orch', 'config.json');
  if (!existsSync(configPath)) {
    process.stderr.write(`❌ 规则自愈编译器失败：找不到项目配置文件 ${configPath}\n`);
    process.exit(1);
  }

  let currentConfigRaw = readFileSync(configPath, 'utf8');
  let currentConfig: any;
  try {
    currentConfig = JSON.parse(currentConfigRaw);
  } catch {
    process.stderr.write(`❌ 规则自愈编译器失败：项目 config.json 损坏，无法合并新规则。\n`);
    process.exit(1);
  }

  // 5. 模拟或真实合并 rules
  let mutated = false;
  const originalKeywords = [...(currentConfig.greenVerdict?.errorKeywords || [])];
  const originalPaths = [...(currentConfig.whitelistEnforcePaths || [])];
  const originalHooks = [...(currentConfig.preToolUseHooks || [])];

  // 合并 errorKeywords
  if (candidate.greenVerdict?.errorKeywords) {
    if (!currentConfig.greenVerdict) {
      currentConfig.greenVerdict = {};
    }
    if (!Array.isArray(currentConfig.greenVerdict.errorKeywords)) {
      currentConfig.greenVerdict.errorKeywords = [];
    }
    for (const kw of candidate.greenVerdict.errorKeywords) {
      if (kw && !currentConfig.greenVerdict.errorKeywords.includes(kw) && kw !== '<新增的致命报错词，如 Unhandled Rejection>') {
        currentConfig.greenVerdict.errorKeywords.push(kw);
        mutated = true;
      }
    }
  }

  // 合并 whitelistEnforcePaths
  if (candidate.whitelistEnforcePaths) {
    if (!Array.isArray(currentConfig.whitelistEnforcePaths)) {
      currentConfig.whitelistEnforcePaths = [];
    }
    for (const p of candidate.whitelistEnforcePaths) {
      if (p && !currentConfig.whitelistEnforcePaths.includes(p) && p !== '<新增的越界敏感防御路径，如 config/secrets/>') {
        currentConfig.whitelistEnforcePaths.push(p);
        mutated = true;
      }
    }
  }

  // 合并 preToolUseHooks 物理写入
  if (candidate.preToolUseHooks) {
    if (!Array.isArray(currentConfig.preToolUseHooks)) {
      currentConfig.preToolUseHooks = [];
    }
    for (const hook of candidate.preToolUseHooks) {
      if (hook && hook.pattern) {
        const exists = currentConfig.preToolUseHooks.some((h: any) => h.pattern === hook.pattern);
        if (!exists) {
          currentConfig.preToolUseHooks.push(hook);
          mutated = true;
        }
      }
    }
  }

  // 6. 输出 diff 报告
  if (dryRun) {
    const diffKeywords = (currentConfig.greenVerdict?.errorKeywords || []).filter((kw: string) => !originalKeywords.includes(kw));
    const diffPaths = (currentConfig.whitelistEnforcePaths || []).filter((p: string) => !originalPaths.includes(p));
    const diffHooks = (currentConfig.preToolUseHooks || []).filter((h: any) => !originalHooks.some((oh: any) => oh.pattern === h.pattern));

    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        mutated,
        diffs: {
          addedKeywords: diffKeywords,
          addedPaths: diffPaths,
          addedHooks: diffHooks,
        },
        hint: `🧬 [自进化 rules compiler (Dry-Run)]\n` +
          `- 新增真绿报错词: ${diffKeywords.length > 0 ? diffKeywords.join(', ') : '无'}\n` +
          `- 新增拦截敏感路径: ${diffPaths.length > 0 ? diffPaths.join(', ') : '无'}\n` +
          `- 新增 pre-tool-use 正则拦截: ${diffHooks.length > 0 ? diffHooks.map((h: any) => h.pattern).join(', ') : '无'}\n\n` +
          `请核对上述防御规则是否合理。若要物理合入，请执行以下命令完成系统免疫升级：\n` +
          `npm run orch -- guardrail-compile --phase-issue ${phaseIssue} --confirm`,
      }) + '\n'
    );
    return;
  }

  // 7. 物理合入落盘
  if (mutated) {
    // 严格检查 allowAutoRewrite 安全红线阻断
    if (config.guardrailCompiler?.allowAutoRewrite === false) {
      process.stderr.write(`❌ 规则自愈编译器阻断：项目配置 guardrailCompiler.allowAutoRewrite 设为了 false，安全机制严禁自动化编译脚本强行重写修改配置文件！请手动将其合并入 ${configPath}\n`);
      process.exit(1);
    }

    try {
      writeFileSync(configPath, JSON.stringify(currentConfig, null, 2) + '\n', 'utf8');
    } catch (err) {
      process.stderr.write(`❌ 物理写入免疫规约失败：${(err as Error).message}\n`);
      process.exit(1);
    }
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      confirmed: true,
      mutated,
      hint: `🎉 [系统免疫升级成功] 已成功将 Phase #${phaseIssue} 的防错与正则拦截规则（PreToolUseHooks）物理合并写入项目配置 ${configPath}！\n系统防御属性已自动自适应提升。`,
    }) + '\n'
  );
}
