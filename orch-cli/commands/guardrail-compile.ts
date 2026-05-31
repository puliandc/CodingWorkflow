import { parseArgs, requireInt, flag } from '../lib/argv';
import { loadState, mainRepoRoot } from '../lib/state';
import { loadConfig } from '../lib/config';

/**
 * guardrail-compile 子命令：读取 retro.md 编译防错候选配置与钩子 Diffs (第三阶段骨架)
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const phaseIssue = requireInt(parsed, 'phase-issue', '缺少必需参数：--phase-issue <Phase issue 编号>');
  const dryRun = flag(parsed, 'dry-run');

  let config;
  let state;
  try {
    config = loadConfig();
    state = loadState();
  } catch (err) {
    process.stderr.write(`❌ 规则编译失败：${(err as Error).message}\n`);
    process.exit(1);
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      dryRun,
      phaseIssue,
      compiledRules: [],
      hint: `🚧 [自适应规则编译器] 当前为第三阶段前置骨架。已读取 Phase #${phaseIssue}，检测到编译模式：${dryRun ? 'Dry-Run 模拟' : '管理员确认'}。`,
    }) + '\n'
  );
}
