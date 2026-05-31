/**
 * gh CLI 调用封装
 * 注入 GH_TOKEN（若环境变量存在）、统一错误处理
 * 成功返回 stdout 字符串，失败 throw Error（含 stderr 信息）
 */

import { execFileSync, ExecFileSyncOptions } from 'node:child_process';

/**
 * 构建 gh 命令的执行环境
 * 若存在 GH_TOKEN 环境变量则注入，否则依赖用户本地 gh 登录态
 */
function buildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (process.env.GH_TOKEN) {
    env.GH_TOKEN = process.env.GH_TOKEN;
  }
  return env;
}

/**
 * 执行 gh CLI 命令，返回 stdout 字符串（已 trim）
 * @param args gh 命令参数数组
 * @param input 可选的 stdin 输入
 * @param dryRun 若为 true，打印命令但不执行，返回空字符串
 * @returns stdout 内容
 * @throws 命令失败时抛出包含 stderr 的错误
 */
export function gh(args: string[], input?: string, dryRun = false): string {
  if (dryRun) {
    const cmd = ['gh', ...args].map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ');
    process.stdout.write(JSON.stringify({ dryRun: true, cmd }) + '\n');
    return '';
  }

  const opts: ExecFileSyncOptions = {
    encoding: 'utf8',
    env: buildEnv(),
  };
  if (input !== undefined) {
    opts.input = input;
  }

  try {
    const result = execFileSync('gh', args, opts) as string;
    return result.trim();
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string | Buffer };
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() ?? '';
    const msg = stderr.trim() || e.message;
    throw new Error(`gh 命令失败：gh ${args.join(' ')}\n${msg}`);
  }
}

/**
 * 执行 gh CLI 命令并解析 JSON 输出
 * @param args gh 命令参数数组
 * @param dryRun 若为 true，打印命令但不执行，返回空对象
 * @returns 解析后的 JSON 对象
 */
export function ghJson<T>(args: string[], dryRun = false): T {
  if (dryRun) {
    gh(args, undefined, true);
    return {} as T;
  }
  const raw = gh(args, undefined, false);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`gh 输出不是合法 JSON：${raw}`);
  }
}
