"use strict";
/**
 * 极简命令行参数解析器
 * 支持两种形式：
 *   --key value  → { key: "value" }
 *   --flag       → { flag: true }
 * 不依赖第三方库
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = parseArgs;
exports.requireString = requireString;
exports.requireInt = requireInt;
exports.optionalString = optionalString;
exports.flag = flag;
/**
 * 解析命令行参数数组
 * @param args 参数数组（通常是 process.argv.slice(3)）
 * @returns 键值映射对象
 */
function parseArgs(args) {
    const result = {};
    let i = 0;
    while (i < args.length) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            // 检查下一个是否是值（不以 -- 开头）
            if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                result[key] = args[i + 1];
                i += 2;
            }
            else {
                // 布尔标志
                result[key] = true;
                i += 1;
            }
        }
        else {
            // 忽略非 -- 开头的参数
            i += 1;
        }
    }
    return result;
}
/**
 * 从已解析参数中获取必需字符串值，缺失时 stderr 报错并退出
 * @param args 已解析参数
 * @param key 参数名（不含 --）
 * @param errorMsg 缺失时的中文错误信息
 * @returns 字符串值
 */
function requireString(args, key, errorMsg) {
    const val = args[key];
    if (typeof val !== 'string' || !val) {
        process.stderr.write((errorMsg ?? `缺少必需参数：--${key}`) + '\n');
        process.exit(1);
    }
    return val;
}
/**
 * 从已解析参数中获取必需数字值（通常是 issue/PR 编号）
 * @param args 已解析参数
 * @param key 参数名（不含 --）
 * @param errorMsg 缺失或非法时的中文错误信息
 * @returns 整数值
 */
function requireInt(args, key, errorMsg) {
    const val = args[key];
    const n = parseInt(String(val), 10);
    if (typeof val === 'undefined' || isNaN(n)) {
        process.stderr.write((errorMsg ?? `缺少必需参数：--${key}（必须是整数）`) + '\n');
        process.exit(1);
    }
    return n;
}
/**
 * 读取可选字符串参数
 * @param args 已解析参数
 * @param key 参数名（不含 --）
 * @returns 字符串或 undefined
 */
function optionalString(args, key) {
    const val = args[key];
    return typeof val === 'string' ? val : undefined;
}
/**
 * 读取布尔标志参数
 * @param args 已解析参数
 * @param key 参数名（不含 --）
 * @returns true / false
 */
function flag(args, key) {
    return args[key] === true || args[key] === 'true';
}
