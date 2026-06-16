import { parseArgs, requireInt, flag, optionalString } from '../lib/argv';
import { loadConfig } from '../lib/config';
import { changedFilesFromArg, evaluateArchitectureDocsCheck } from '../lib/architecture-docs';

/**
 * architecture-docs-check 子命令
 * 根据变更文件和 docs/architecture/maintenance-map.json 判定是否需要维护全局架构文档。
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const phaseIssue = requireInt(parsed, 'phase-issue', '缺少必需参数：--phase-issue <Phase issue 编号>');
  const dryRun = flag(parsed, 'dry-run');
  const changedFiles = changedFilesFromArg(optionalString(parsed, 'changed-files'));
  const baseRef = optionalString(parsed, 'base-ref');

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    process.stderr.write(`❌ 架构文档检查失败：${(err as Error).message}\n`);
    process.exit(1);
  }

  try {
    const result = evaluateArchitectureDocsCheck({
      config,
      phaseIssue,
      dryRun,
      changedFiles,
      baseRef,
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (err) {
    process.stderr.write(`❌ 架构文档检查失败：${(err as Error).message}\n`);
    process.exit(1);
  }
}
