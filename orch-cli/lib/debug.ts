import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import type { ProjectConfig } from './config';
import { currentWorktreeRoot } from './state';

export type DebugGatePolicy = 'block' | 'warn' | 'off';

export interface DebugTempLogEntry {
  sub: number;
  path: string;
  reason: string;
  createdAt: string;
}

export interface DebugTempLogManifest {
  version: 1;
  entries: DebugTempLogEntry[];
}

export const DEBUG_DIR = '.orch/debug';
export const TEMP_LOG_MANIFEST = `${DEBUG_DIR}/temp-log-allowlist.json`;

export function getDebugGatePolicy(config: ProjectConfig): DebugGatePolicy {
  const raw = config.workflowGates?.debug;
  if (raw === 'warn' || raw === 'off' || raw === 'block') {
    return raw;
  }
  return 'block';
}

export function normalizeRelativePath(inputPath: string, root = currentWorktreeRoot()): string {
  if (!inputPath.trim()) {
    throw new Error('--path 不能为空');
  }

  const absRoot = resolve(root);
  const absPath = resolve(absRoot, inputPath);
  if (absPath !== absRoot && !absPath.startsWith(absRoot + sep)) {
    throw new Error(`Debug 临时日志路径必须位于当前 worktree 内：${inputPath}`);
  }

  const rel = relative(absRoot, absPath).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..') || rel.startsWith('/')) {
    throw new Error(`Debug 临时日志路径非法：${inputPath}`);
  }
  return rel;
}

export function debugManifestPath(root = currentWorktreeRoot()): string {
  return resolve(root, TEMP_LOG_MANIFEST);
}

export function loadDebugTempLogManifest(root = currentWorktreeRoot()): DebugTempLogManifest {
  const manifestPath = debugManifestPath(root);
  if (!existsSync(manifestPath)) {
    return { version: 1, entries: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`Debug 临时日志清单无法解析：${manifestPath}，${(err as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Debug 临时日志清单格式错误：${manifestPath}`);
  }

  const obj = parsed as Record<string, unknown>;
  const rawEntries = obj.entries;
  if (obj.version !== 1 || !Array.isArray(rawEntries)) {
    throw new Error(`Debug 临时日志清单格式错误：缺少 version=1 或 entries 数组`);
  }

  const entries: DebugTempLogEntry[] = [];
  for (let index = 0; index < rawEntries.length; index++) {
    const entry = rawEntries[index];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`Debug 临时日志清单 entries[${index}] 不是对象`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.sub !== 'number' || typeof e.path !== 'string' || typeof e.reason !== 'string' || typeof e.createdAt !== 'string') {
      throw new Error(`Debug 临时日志清单 entries[${index}] 字段不完整`);
    }
    entries.push({
      sub: e.sub,
      path: e.path,
      reason: e.reason,
      createdAt: e.createdAt,
    });
  }

  return { version: 1, entries };
}

export function saveDebugTempLogManifest(manifest: DebugTempLogManifest, root = currentWorktreeRoot()): void {
  const manifestPath = debugManifestPath(root);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
