"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const state_1 = require("./state");
let loadedConfig = null;
/**
 * 加载并缓存当前项目的 .orch/config.json 专属配置
 */
function loadConfig() {
    if (loadedConfig)
        return loadedConfig;
    const root = (0, state_1.mainRepoRoot)();
    const configPath = (0, node_path_1.resolve)(root, '.orch', 'config.json');
    if (!(0, node_fs_1.existsSync)(configPath)) {
        throw new Error(`项目配置文件不存在：${configPath}\n请在项目根目录创建 .orch/config.json 配置文件。`);
    }
    try {
        const raw = (0, node_fs_1.readFileSync)(configPath, 'utf8');
        loadedConfig = JSON.parse(raw);
        validateConfig(loadedConfig);
        return loadedConfig;
    }
    catch (err) {
        throw new Error(`无法读取或解析项目配置 ${configPath}：${err.message}`);
    }
}
function validateConfig(config) {
    if (!config.repo) {
        throw new Error('配置错误：缺少 repo 参数（"owner/name"）');
    }
    if (!config.baseBranch) {
        throw new Error('配置错误：缺少 baseBranch 参数（"origin/main"）');
    }
}
