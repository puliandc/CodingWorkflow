"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEMP_LOG_MANIFEST = exports.DEBUG_DIR = void 0;
exports.getDebugGatePolicy = getDebugGatePolicy;
exports.normalizeRelativePath = normalizeRelativePath;
exports.debugManifestPath = debugManifestPath;
exports.loadDebugTempLogManifest = loadDebugTempLogManifest;
exports.saveDebugTempLogManifest = saveDebugTempLogManifest;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const state_1 = require("./state");
exports.DEBUG_DIR = '.orch/debug';
exports.TEMP_LOG_MANIFEST = `${exports.DEBUG_DIR}/temp-log-allowlist.json`;
function getDebugGatePolicy(config) {
    const raw = config.workflowGates?.debug;
    if (raw === 'warn' || raw === 'off' || raw === 'block') {
        return raw;
    }
    return 'block';
}
function normalizeRelativePath(inputPath, root = (0, state_1.currentWorktreeRoot)()) {
    if (!inputPath.trim()) {
        throw new Error('--path 不能为空');
    }
    const absRoot = (0, node_path_1.resolve)(root);
    const absPath = (0, node_path_1.resolve)(absRoot, inputPath);
    if (absPath !== absRoot && !absPath.startsWith(absRoot + node_path_1.sep)) {
        throw new Error(`Debug 临时日志路径必须位于当前 worktree 内：${inputPath}`);
    }
    const rel = (0, node_path_1.relative)(absRoot, absPath).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..') || rel.startsWith('/')) {
        throw new Error(`Debug 临时日志路径非法：${inputPath}`);
    }
    return rel;
}
function debugManifestPath(root = (0, state_1.currentWorktreeRoot)()) {
    return (0, node_path_1.resolve)(root, exports.TEMP_LOG_MANIFEST);
}
function loadDebugTempLogManifest(root = (0, state_1.currentWorktreeRoot)()) {
    const manifestPath = debugManifestPath(root);
    if (!(0, node_fs_1.existsSync)(manifestPath)) {
        return { version: 1, entries: [] };
    }
    let parsed;
    try {
        parsed = JSON.parse((0, node_fs_1.readFileSync)(manifestPath, 'utf8'));
    }
    catch (err) {
        throw new Error(`Debug 临时日志清单无法解析：${manifestPath}，${err.message}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Debug 临时日志清单格式错误：${manifestPath}`);
    }
    const obj = parsed;
    const rawEntries = obj.entries;
    if (obj.version !== 1 || !Array.isArray(rawEntries)) {
        throw new Error(`Debug 临时日志清单格式错误：缺少 version=1 或 entries 数组`);
    }
    const entries = [];
    for (let index = 0; index < rawEntries.length; index++) {
        const entry = rawEntries[index];
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            throw new Error(`Debug 临时日志清单 entries[${index}] 不是对象`);
        }
        const e = entry;
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
function saveDebugTempLogManifest(manifest, root = (0, state_1.currentWorktreeRoot)()) {
    const manifestPath = debugManifestPath(root);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(manifestPath), { recursive: true });
    (0, node_fs_1.writeFileSync)(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
