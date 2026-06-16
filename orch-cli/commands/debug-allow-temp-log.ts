import { parseArgs, requireInt, requireString, optionalString, flag } from '../lib/argv';
import {
  debugManifestPath,
  loadDebugTempLogManifest,
  normalizeRelativePath,
  saveDebugTempLogManifest,
} from '../lib/debug';
import { currentWorktreeRoot } from '../lib/state';

/**
 * debug-allow-temp-log 子命令：登记 Debug 期间允许越过 arch 白名单补临时日志的文件。
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const subNumber = requireInt(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
  const inputPath = requireString(parsed, 'path', '缺少必需参数：--path <relative-file>');
  const reason = optionalString(parsed, 'reason') ?? 'Debug 临时诊断日志';
  const dryRun = flag(parsed, 'dry-run');

  const root = currentWorktreeRoot();
  let relPath: string;
  try {
    relPath = normalizeRelativePath(inputPath, root);
  } catch (err) {
    process.stderr.write((err as Error).message + '\n');
    process.exit(1);
  }

  const manifestPath = debugManifestPath(root);
  const entry = {
    sub: subNumber,
    path: relPath,
    reason,
    createdAt: new Date().toISOString(),
  };

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        manifestPath,
        willAllow: entry,
        requiredMarker: `ORCH_DEBUG_TEMP:${subNumber}:<attempt>`,
        hint: '将登记 Debug 临时日志白名单外写入授权；实际日志仍必须包含 ORCH_DEBUG_TEMP 标记。',
      }) + '\n',
    );
    return;
  }

  let manifest;
  try {
    manifest = loadDebugTempLogManifest(root);
  } catch (err) {
    process.stderr.write((err as Error).message + '\n');
    process.exit(1);
  }

  const existingIndex = manifest.entries.findIndex(e => e.sub === subNumber && e.path === relPath);
  if (existingIndex >= 0) {
    manifest.entries[existingIndex] = entry;
  } else {
    manifest.entries.push(entry);
  }

  try {
    saveDebugTempLogManifest(manifest, root);
  } catch (err) {
    process.stderr.write(`无法写入 Debug 临时日志清单：${(err as Error).message}\n`);
    process.exit(1);
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      manifestPath,
      allowed: entry,
      requiredMarker: `ORCH_DEBUG_TEMP:${subNumber}:<attempt>`,
      hint: `已允许 Debug 在 ${relPath} 补临时诊断日志；日志必须带 ORCH_DEBUG_TEMP:${subNumber}:<attempt> 标记，修复后必须清理。`,
    }) + '\n',
  );
}

