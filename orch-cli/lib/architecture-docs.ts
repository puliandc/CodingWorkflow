import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ProjectConfig } from './config';
import { mainRepoRoot } from './state';

export type ArchitectureDocsDecision = 'no-op' | 'update-required' | 'conservative-update';
export type ArchitectureDocsUncertaintyPolicy = 'conservative-update' | 'no-op';

export interface ArchitectureDocsConfig {
  enabled?: boolean;
  dir?: string;
  uncertaintyPolicy?: ArchitectureDocsUncertaintyPolicy;
}

export interface MaintenanceMap {
  rules?: Record<string, string[]>;
  ignoredPrefixes?: string[];
  ignoredPatterns?: string[];
  conservativeTarget?: string;
}

export interface ArchitectureDocsCheckOptions {
  config: ProjectConfig;
  phaseIssue: number;
  dryRun: boolean;
  changedFiles?: string[];
  baseRef?: string;
}

export interface ArchitectureDocsCheckResult {
  ok: true;
  dryRun: boolean;
  phaseIssue: number;
  enabled: boolean;
  docsDir: string;
  mapPath: string;
  decision: ArchitectureDocsDecision;
  changedFiles: string[];
  matchedFiles: string[];
  ignoredFiles: string[];
  unknownFiles: string[];
  targetDocs: string[];
  matchedRules: Record<string, string[]>;
  reasons: string[];
  hint: string;
}

const DEFAULT_DOCS_DIR = 'docs/architecture';
const DEFAULT_UNCERTAINTY_POLICY: ArchitectureDocsUncertaintyPolicy = 'conservative-update';
const DEFAULT_CONSERVATIVE_TARGET = 'changelog.md';

function normalizePath(file: string): string {
  return file.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function parseChangedFiles(raw: string): string[] {
  return uniqueSorted(raw.split(/[\n,]+/).map(normalizePath).filter(Boolean));
}

function runGitDiff(baseRef: string): string[] {
  const attempts: string[][] = [
    ['diff', '--name-only', `${baseRef}...HEAD`],
    ['diff', '--name-only', baseRef, 'HEAD'],
    ['diff', '--name-only', 'HEAD~1', 'HEAD'],
  ];

  for (const args of attempts) {
    try {
      const out = execFileSync('git', args, { encoding: 'utf8' });
      return parseChangedFiles(out);
    } catch {
      // 尝试下一个可用的本地 diff 口径。
    }
  }

  return [];
}

function resolveDocsConfig(config: ProjectConfig): Required<ArchitectureDocsConfig> {
  const raw = config.architectureDocs ?? {};
  return {
    enabled: raw.enabled ?? true,
    dir: raw.dir ?? DEFAULT_DOCS_DIR,
    uncertaintyPolicy: raw.uncertaintyPolicy ?? DEFAULT_UNCERTAINTY_POLICY,
  };
}

function readMaintenanceMap(mapPath: string): MaintenanceMap {
  const raw = readFileSync(mapPath, 'utf8');
  const parsed = JSON.parse(raw) as MaintenanceMap;
  return {
    rules: parsed.rules ?? {},
    ignoredPrefixes: parsed.ignoredPrefixes ?? [],
    ignoredPatterns: parsed.ignoredPatterns ?? [],
    conservativeTarget: parsed.conservativeTarget ?? DEFAULT_CONSERVATIVE_TARGET,
  };
}

function matchesRule(file: string, rulePrefix: string): boolean {
  const normalizedRule = normalizePath(rulePrefix);
  return file === normalizedRule || file.startsWith(normalizedRule);
}

function isIgnored(file: string, map: MaintenanceMap): boolean {
  for (const prefix of map.ignoredPrefixes ?? []) {
    if (matchesRule(file, prefix)) return true;
  }

  for (const pattern of map.ignoredPatterns ?? []) {
    try {
      if (new RegExp(pattern).test(file)) return true;
    } catch {
      // 非法正则视为无效规则，避免文档映射误阻断流程。
    }
  }

  return false;
}

function toDocPath(docsDir: string, relDoc: string): string {
  const cleanDocsDir = normalizePath(docsDir).replace(/\/$/, '');
  const cleanRelDoc = normalizePath(relDoc);
  return `${cleanDocsDir}/${cleanRelDoc}`;
}

export function evaluateArchitectureDocsCheck(options: ArchitectureDocsCheckOptions): ArchitectureDocsCheckResult {
  const docsConfig = resolveDocsConfig(options.config);
  const root = mainRepoRoot();
  const mapPath = resolve(root, docsConfig.dir, 'maintenance-map.json');
  const reasons: string[] = [];

  if (!docsConfig.enabled) {
    return {
      ok: true,
      dryRun: options.dryRun,
      phaseIssue: options.phaseIssue,
      enabled: false,
      docsDir: docsConfig.dir,
      mapPath,
      decision: 'no-op',
      changedFiles: [],
      matchedFiles: [],
      ignoredFiles: [],
      unknownFiles: [],
      targetDocs: [],
      matchedRules: {},
      reasons: ['architectureDocs.enabled=false，跳过全局架构文档检查'],
      hint: '全局架构文档检查已关闭',
    };
  }

  if (!existsSync(mapPath)) {
    return {
      ok: true,
      dryRun: options.dryRun,
      phaseIssue: options.phaseIssue,
      enabled: false,
      docsDir: docsConfig.dir,
      mapPath,
      decision: 'no-op',
      changedFiles: [],
      matchedFiles: [],
      ignoredFiles: [],
      unknownFiles: [],
      targetDocs: [],
      matchedRules: {},
      reasons: [`维护映射不存在：${docsConfig.dir}/maintenance-map.json，默认跳过`],
      hint: '未启用全局架构文档检查',
    };
  }

  const map = readMaintenanceMap(mapPath);
  const changedFiles = options.changedFiles
    ? uniqueSorted(options.changedFiles.map(normalizePath).filter(Boolean))
    : runGitDiff(options.baseRef ?? options.config.baseBranch);

  if (changedFiles.length === 0) {
    return {
      ok: true,
      dryRun: options.dryRun,
      phaseIssue: options.phaseIssue,
      enabled: true,
      docsDir: docsConfig.dir,
      mapPath,
      decision: 'no-op',
      changedFiles,
      matchedFiles: [],
      ignoredFiles: [],
      unknownFiles: [],
      targetDocs: [],
      matchedRules: {},
      reasons: ['未检测到变更文件'],
      hint: '无需更新全局架构文档',
    };
  }

  const targetDocs = new Set<string>();
  const matchedFiles = new Set<string>();
  const ignoredFiles = new Set<string>();
  const unknownFiles = new Set<string>();
  const matchedRules: Record<string, string[]> = {};

  for (const file of changedFiles) {
    if (isIgnored(file, map)) {
      ignoredFiles.add(file);
      continue;
    }

    const matchedDocs = new Set<string>();
    for (const [prefix, docs] of Object.entries(map.rules ?? {})) {
      if (matchesRule(file, prefix)) {
        for (const doc of docs) {
          matchedDocs.add(toDocPath(docsConfig.dir, doc));
        }
      }
    }

    if (matchedDocs.size > 0) {
      matchedFiles.add(file);
      const docs = uniqueSorted(matchedDocs);
      matchedRules[file] = docs;
      for (const doc of docs) targetDocs.add(doc);
    } else {
      unknownFiles.add(file);
    }
  }

  let decision: ArchitectureDocsDecision = 'no-op';
  if (targetDocs.size > 0) {
    decision = 'update-required';
    reasons.push('变更文件命中架构文档维护映射');
  } else if (unknownFiles.size > 0 && docsConfig.uncertaintyPolicy === 'conservative-update') {
    decision = 'conservative-update';
    targetDocs.add(toDocPath(docsConfig.dir, map.conservativeTarget ?? DEFAULT_CONSERVATIVE_TARGET));
    reasons.push('存在未命中映射且未被忽略的变更文件，按保守策略追加架构变更日志');
  } else {
    reasons.push('变更文件均被忽略或按配置无需保守更新');
  }

  if (unknownFiles.size > 0 && targetDocs.size > 0 && decision === 'update-required') {
    targetDocs.add(toDocPath(docsConfig.dir, map.conservativeTarget ?? DEFAULT_CONSERVATIVE_TARGET));
    reasons.push('同时存在未知变更文件，追加架构变更日志供人工复核');
  }

  return {
    ok: true,
    dryRun: options.dryRun,
    phaseIssue: options.phaseIssue,
    enabled: true,
    docsDir: docsConfig.dir,
    mapPath,
    decision,
    changedFiles,
    matchedFiles: uniqueSorted(matchedFiles),
    ignoredFiles: uniqueSorted(ignoredFiles),
    unknownFiles: uniqueSorted(unknownFiles),
    targetDocs: uniqueSorted(targetDocs),
    matchedRules,
    reasons,
    hint: decision === 'no-op'
      ? '无需更新全局架构文档'
      : `需要维护全局架构文档：${uniqueSorted(targetDocs).join(', ')}`,
  };
}

export function changedFilesFromArg(raw: string | undefined): string[] | undefined {
  return raw ? parseChangedFiles(raw) : undefined;
}
