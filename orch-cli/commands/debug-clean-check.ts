import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs, requireInt, flag } from '../lib/argv';
import { currentWorktreeRoot } from '../lib/state';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'docs',
  '.orch/debug',
  '.orch/phases',
  'orch-cli/dist',
  'orch-cli/node_modules',
]);

const SKIP_FILE_NAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
]);

const SKIP_EXTS = new Set(['.pem', '.key', '.p12', '.pfx']);

function shouldSkip(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  if (!normalized) return false;
  for (const dir of SKIP_DIRS) {
    if (normalized === dir || normalized.startsWith(dir + '/')) {
      return true;
    }
  }

  const base = normalized.split('/').pop() ?? '';
  if (SKIP_FILE_NAMES.has(base) || base.startsWith('.env.')) {
    return true;
  }

  return [...SKIP_EXTS].some(ext => base.endsWith(ext));
}

function collectFiles(root: string, dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const rel = relative(root, abs).replace(/\\/g, '/');
    if (shouldSkip(rel)) continue;

    const st = statSync(abs);
    if (st.isDirectory()) {
      collectFiles(root, abs, out);
    } else if (st.isFile() && st.size <= 1024 * 1024) {
      out.push(abs);
    }
  }
}

/**
 * debug-clean-check 子命令：确认源码中不再残留 ORCH_DEBUG_TEMP 临时日志标记。
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const subNumber = requireInt(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
  const dryRun = flag(parsed, 'dry-run');

  const root = currentWorktreeRoot();
  const markerPrefix = `ORCH_DEBUG_TEMP:${subNumber}:`;
  const files: string[] = [];

  if (!existsSync(root)) {
    process.stderr.write(`当前 worktree 不存在：${root}\n`);
    process.exit(1);
  }

  collectFiles(root, root, files);

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        root,
        markerPrefix,
        scannedFileCount: files.length,
        skipped: [...SKIP_DIRS],
        hint: '将扫描非 docs/.orch/debug 的源码文件，确认无 Debug 临时日志标记残留。',
      }) + '\n',
    );
    return;
  }

  const hits: Array<{ path: string; line: number; text: string }> = [];
  for (const file of files) {
    let content = '';
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!content.includes(markerPrefix)) continue;
    const rel = relative(root, file).replace(/\\/g, '/');
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(markerPrefix)) {
        hits.push({ path: rel, line: i + 1, text: lines[i].trim().slice(0, 160) });
      }
    }
  }

  if (hits.length > 0) {
    process.stderr.write(
      `❌ Debug 临时日志清理失败：仍发现 ${hits.length} 处 ${markerPrefix} 标记残留。\n` +
      JSON.stringify({ ok: false, passed: false, hits }, null, 2) + '\n',
    );
    process.exit(1);
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      passed: true,
      markerPrefix,
      scannedFileCount: files.length,
      hint: 'Debug 临时日志清理检查通过，源码中未发现 ORCH_DEBUG_TEMP 残留。',
    }) + '\n',
  );
}

