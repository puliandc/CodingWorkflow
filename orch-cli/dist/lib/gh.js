"use strict";
/**
 * gh CLI 调用封装
 * 注入 GH_TOKEN（若环境变量存在）、统一错误处理
 * 成功返回 stdout 字符串，失败 throw Error（含 stderr 信息）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.gh = gh;
exports.ghJson = ghJson;
const node_child_process_1 = require("node:child_process");
/** 认证失败关键词，用于判断是否值得清 token 重试 */
const AUTH_FAIL_PATTERNS = [
    'authentication',
    'http 401',
    '401',
    'bad credentials',
    'gh auth login',
    'not logged',
    'not logged in',
    'token',
];
function isAuthError(stderr) {
    const lower = stderr.toLowerCase();
    return AUTH_FAIL_PATTERNS.some(p => lower.includes(p));
}
/**
 * 构建 gh 命令的执行环境。
 * @param stripToken 若 true，删除 GITHUB_TOKEN / GH_TOKEN，让 gh 依赖本地 keyring。
 */
function buildEnv(stripToken = false) {
    const env = { ...process.env };
    if (stripToken) {
        delete env.GITHUB_TOKEN;
        delete env.GH_TOKEN;
    }
    // 原来是把 GH_TOKEN 赋回自己（空操作）；保持默认行为不变，即 token 透传。
    return env;
}
/**
 * 内部核心执行（单次，不含重试逻辑）。
 */
function execGh(args, input, stripToken, timeout) {
    const opts = {
        encoding: 'utf8',
        env: buildEnv(stripToken),
        timeout,
    };
    if (input !== undefined) {
        opts.input = input;
    }
    const result = (0, node_child_process_1.execFileSync)('gh', args, opts);
    return result.trim();
}
/**
 * 执行 gh CLI 命令，返回 stdout 字符串（已 trim）。
 *
 * 签名与旧版完全兼容：
 *   gh(args, input?, dryRun?)
 *
 * 新增可选第 4 参数 opts（GhOpts）：
 *   gh(args, input?, dryRun?, opts?)
 *
 * @param args   gh 命令参数数组
 * @param input  可选的 stdin 输入
 * @param dryRun 若为 true，打印命令但不执行，返回空字符串
 * @param opts   可选扩展选项（repo / timeout / stripToken）
 */
function gh(args, input, dryRun = false, opts = {}) {
    // 展开 repo 参数
    const effectiveArgs = opts.repo ? ['--repo', opts.repo, ...args] : [...args];
    const timeout = opts.timeout ?? 20000;
    if (dryRun) {
        const cmd = ['gh', ...effectiveArgs].map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ');
        process.stdout.write(JSON.stringify({ dryRun: true, cmd }) + '\n');
        return '';
    }
    // 首次尝试（使用当前 env 中的 token，若有的话）
    try {
        return execGh(effectiveArgs, input, opts.stripToken ?? false, timeout);
    }
    catch (err) {
        const e = err;
        // 超时检测
        if (e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT') {
            throw new Error(`gh 命令超时（${timeout}ms）：gh ${effectiveArgs.join(' ')}\n` +
                `请检查网络连接或增大 timeout 选项。`);
        }
        const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() ?? '';
        // 认证失败且环境变量中有 token → 清除 token 重试一次
        const hasEnvToken = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
        if (isAuthError(stderr) && hasEnvToken && !(opts.stripToken)) {
            process.stderr.write(`⚠️ [gh wrapper] 检测到环境变量 token 导致认证失败，清除后重试（依赖本地 keyring）…\n`);
            try {
                return execGh(effectiveArgs, input, /* stripToken= */ true, timeout);
            }
            catch (retryErr) {
                const re = retryErr;
                const retryStderr = typeof re.stderr === 'string' ? re.stderr : re.stderr?.toString() ?? '';
                const retryMsg = retryStderr.trim() || re.message;
                // 判断重试后的具体失败原因
                let diagnosis;
                if (isAuthError(retryMsg)) {
                    diagnosis = 'gh 本地 keyring 也未登录或 token 已失效，请运行 `gh auth login` 重新授权。';
                }
                else if (retryMsg.toLowerCase().includes('network') || retryMsg.toLowerCase().includes('connect')) {
                    diagnosis = 'gh 认证重试时遭遇网络错误，请检查网络连接后重试。';
                }
                else {
                    diagnosis = `重试后仍失败：${retryMsg}`;
                }
                throw new Error(`gh 命令失败（清除坏 token 重试后仍失败）：gh ${effectiveArgs.join(' ')}\n` +
                    `诊断：${diagnosis}\n` +
                    `stderr: ${retryMsg}`);
            }
        }
        // 普通失败
        const msg = stderr.trim() || e.message;
        throw new Error(`gh 命令失败：gh ${effectiveArgs.join(' ')}\n${msg}`);
    }
}
/**
 * 执行 gh CLI 命令并解析 JSON 输出。
 *
 * 签名与旧版完全兼容：
 *   ghJson(args, dryRun?)
 *
 * 新增可选第 3 参数 opts（GhOpts）：
 *   ghJson(args, dryRun?, opts?)
 *
 * @param args   gh 命令参数数组
 * @param dryRun 若为 true，打印命令但不执行，返回空对象
 * @param opts   可选扩展选项
 */
function ghJson(args, dryRun = false, opts = {}) {
    if (dryRun) {
        gh(args, undefined, true, opts);
        return {};
    }
    const raw = gh(args, undefined, false, opts);
    try {
        return JSON.parse(raw);
    }
    catch {
        throw new Error(`gh 输出不是合法 JSON：${raw}`);
    }
}
