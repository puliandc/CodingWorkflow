"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateArchitectureDocsCheck = evaluateArchitectureDocsCheck;
exports.changedFilesFromArg = changedFilesFromArg;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const state_1 = require("./state");
const DEFAULT_DOCS_DIR = 'docs/architecture';
const DEFAULT_UNCERTAINTY_POLICY = 'conservative-update';
const DEFAULT_CONSERVATIVE_TARGET = 'changelog.md';
function normalizePath(file) {
    return file.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}
function uniqueSorted(values) {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}
function parseChangedFiles(raw) {
    return uniqueSorted(raw.split(/[\n,]+/).map(normalizePath).filter(Boolean));
}
function runGitDiff(baseRef) {
    const attempts = [
        ['diff', '--name-only', `${baseRef}...HEAD`],
        ['diff', '--name-only', baseRef, 'HEAD'],
        ['diff', '--name-only', 'HEAD~1', 'HEAD'],
    ];
    for (const args of attempts) {
        try {
            const out = (0, node_child_process_1.execFileSync)('git', args, { encoding: 'utf8' });
            return parseChangedFiles(out);
        }
        catch {
            // 尝试下一个可用的本地 diff 口径。
        }
    }
    return [];
}
function resolveDocsConfig(config) {
    const raw = config.architectureDocs ?? {};
    return {
        enabled: raw.enabled ?? true,
        dir: raw.dir ?? DEFAULT_DOCS_DIR,
        uncertaintyPolicy: raw.uncertaintyPolicy ?? DEFAULT_UNCERTAINTY_POLICY,
    };
}
function readMaintenanceMap(mapPath) {
    const raw = (0, node_fs_1.readFileSync)(mapPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
        rules: parsed.rules ?? {},
        ignoredPrefixes: parsed.ignoredPrefixes ?? [],
        ignoredPatterns: parsed.ignoredPatterns ?? [],
        conservativeTarget: parsed.conservativeTarget ?? DEFAULT_CONSERVATIVE_TARGET,
    };
}
function matchesRule(file, rulePrefix) {
    const normalizedRule = normalizePath(rulePrefix);
    return file === normalizedRule || file.startsWith(normalizedRule);
}
function isIgnored(file, map) {
    for (const prefix of map.ignoredPrefixes ?? []) {
        if (matchesRule(file, prefix))
            return true;
    }
    for (const pattern of map.ignoredPatterns ?? []) {
        try {
            if (new RegExp(pattern).test(file))
                return true;
        }
        catch {
            // 非法正则视为无效规则，避免文档映射误阻断流程。
        }
    }
    return false;
}
function toDocPath(docsDir, relDoc) {
    const cleanDocsDir = normalizePath(docsDir).replace(/\/$/, '');
    const cleanRelDoc = normalizePath(relDoc);
    return `${cleanDocsDir}/${cleanRelDoc}`;
}
function evaluateArchitectureDocsCheck(options) {
    const docsConfig = resolveDocsConfig(options.config);
    const root = (0, state_1.mainRepoRoot)();
    const mapPath = (0, node_path_1.resolve)(root, docsConfig.dir, 'maintenance-map.json');
    const reasons = [];
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
    if (!(0, node_fs_1.existsSync)(mapPath)) {
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
    const targetDocs = new Set();
    const matchedFiles = new Set();
    const ignoredFiles = new Set();
    const unknownFiles = new Set();
    const matchedRules = {};
    for (const file of changedFiles) {
        if (isIgnored(file, map)) {
            ignoredFiles.add(file);
            continue;
        }
        const matchedDocs = new Set();
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
            for (const doc of docs)
                targetDocs.add(doc);
        }
        else {
            unknownFiles.add(file);
        }
    }
    let decision = 'no-op';
    if (targetDocs.size > 0) {
        decision = 'update-required';
        reasons.push('变更文件命中架构文档维护映射');
    }
    else if (unknownFiles.size > 0 && docsConfig.uncertaintyPolicy === 'conservative-update') {
        decision = 'conservative-update';
        targetDocs.add(toDocPath(docsConfig.dir, map.conservativeTarget ?? DEFAULT_CONSERVATIVE_TARGET));
        reasons.push('存在未命中映射且未被忽略的变更文件，按保守策略追加架构变更日志');
    }
    else {
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
function changedFilesFromArg(raw) {
    return raw ? parseChangedFiles(raw) : undefined;
}
