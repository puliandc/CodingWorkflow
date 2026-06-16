import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, requireInt, requireString, flag } from '../lib/argv';
import { loadConfig } from '../lib/config';
import { gh } from '../lib/gh';

/**
 * debug-comment 子命令：将 Debug 报告评论到当前 sub-issue。
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const subNumber = requireInt(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
  const reportRaw = requireString(parsed, 'report', '缺少必需参数：--report <debug-report.md>');
  const dryRun = flag(parsed, 'dry-run');

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    process.stderr.write(`Debug 评论失败：${(err as Error).message}\n`);
    process.exit(1);
  }

  const reportPath = resolve(process.cwd(), reportRaw);
  if (!existsSync(reportPath)) {
    process.stderr.write(`Debug 评论失败：报告不存在：${reportPath}\n`);
    process.exit(1);
  }

  let body: string;
  try {
    body = readFileSync(reportPath, 'utf8');
  } catch (err) {
    process.stderr.write(`Debug 评论失败：无法读取报告：${(err as Error).message}\n`);
    process.exit(1);
  }

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        repo: config.repo,
        subIssue: subNumber,
        reportPath,
        bodyBytes: Buffer.byteLength(body, 'utf8'),
        hint: `将把 Debug 诊断报告评论到 ${config.repo} issue #${subNumber}`,
      }) + '\n',
    );
    return;
  }

  try {
    gh(['issue', 'comment', String(subNumber), '--body-file', reportPath], undefined, false, { repo: config.repo });
  } catch (err) {
    process.stderr.write(`Debug 评论失败：${(err as Error).message}\n`);
    process.exit(1);
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      repo: config.repo,
      subIssue: subNumber,
      reportPath,
      hint: `已将 Debug 诊断报告评论到 sub-issue #${subNumber}`,
    }) + '\n',
  );
}

