import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs, requireInt, flag } from '../lib/argv';
import { loadState } from '../lib/state';

/**
 * 从 phase 分支名解析 phase 编号
 */
function parsePhaseNumber(phaseBranch: string): number {
  const m = phaseBranch.match(/^phase-(\d+)-/);
  if (!m) {
    throw new Error(`无法从 phaseBranch "${phaseBranch}" 解析 phase 编号`);
  }
  return parseInt(m[1], 10);
}

/**
 * precheck 命令：在派发 coding 前进行确定性的契约与文档质量门禁校验
 */
export function run(args: string[]): void {
  const parsed = parseArgs(args);
  const subNumber = requireInt(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
  const dryRun = flag(parsed, 'dry-run');

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        dryRun: true,
        hint: '将对子任务的三契约文档进行占位符、白名单非空和回归护栏校验',
      }) + '\n'
    );
    return;
  }

  // 1. 读取进度状态
  let state;
  try {
    state = loadState();
  } catch (err) {
    process.stderr.write((err as Error).message + '\n');
    process.exit(1);
  }

  let phaseNumber: number;
  try {
    phaseNumber = parsePhaseNumber(state.phaseBranch);
  } catch (err) {
    process.stderr.write((err as Error).message + '\n');
    process.exit(1);
  }

  const docsDir = `docs/${state.featureName}/phase-${phaseNumber}/${subNumber}`;
  const absDocsDir = resolve(process.cwd(), docsDir);

  const archPath = resolve(absDocsDir, 'arch.md');
  const testPath = resolve(absDocsDir, 'test.md');

  // 2. 校验文件完整性
  if (!existsSync(archPath)) {
    process.stderr.write(`❌ 门禁拦截：架构锁定契约不存在：${docsDir}/arch.md\n请先派发 arch agent 产出设计。\n`);
    process.exit(1);
  }
  if (!existsSync(testPath)) {
    process.stderr.write(`❌ 门禁拦截：测试方案契约不存在：${docsDir}/test.md\n请确认测试方案已就绪。\n`);
    process.exit(1);
  }

  const archContent = readFileSync(archPath, 'utf8');
  const testContent = readFileSync(testPath, 'utf8');

  // 3. 校验占位符
  const placeholderRegex = /\[(待填写|TODO|待补充|待定义|待完善|TBD)\]/i;
  if (placeholderRegex.test(archContent)) {
    process.stderr.write(`❌ 门禁拦截：arch.md 包含待填写占位符，严禁带病编码！\n`);
    process.exit(1);
  }
  if (placeholderRegex.test(testContent)) {
    process.stderr.write(`❌ 门禁拦截：test.md 包含待填写占位符，严禁带病编码！\n`);
    process.exit(1);
  }

  // 4. 校验契约三表完整性
  // 提取白名单
  const whitelistPaths: string[] = [];
  const whitelistMatch = archContent.match(/#### \[契约\] 文件白名单([\s\S]*?)(?=\n#### |\Z)/);
  if (!whitelistMatch) {
    process.stderr.write(`❌ 门禁拦截：arch.md 缺少结构化 #### [契约] 文件白名单 章节！\n`);
    process.exit(1);
  } else {
    const lines = whitelistMatch[1].strip().split('\n');
    for (const line of lines) {
      if (line.includes('|') && !['允许路径', '---', '允许的路径'].some(k => line.includes(k))) {
        const parts = line.split('|').map(p => p.strip());
        if (parts.length > 2 && parts[1]) {
          const clean = parts[1].replace(/`/g, '').strip();
          if (clean) whitelistPaths.push(clean);
        }
      }
    }
  }

  if (whitelistPaths.length === 0) {
    process.stderr.write(`❌ 门禁拦截：架构契约「文件白名单」为空，请在编码前先界定允许修改的文件！\n`);
    process.exit(1);
  }

  // 提取回归护栏
  const regressionGuardLines: string[] = [];
  const guardMatch = archContent.match(/#### \[契约\] 回归护栏([\s\S]*?)(?=\n#### |\Z)/);
  if (!guardMatch) {
    process.stderr.write(`❌ 门禁拦截：arch.md 缺少结构化 #### [契约] 回归护栏 章节！\n`);
    process.exit(1);
  } else {
    const lines = guardMatch[1].strip().split('\n');
    for (const line of lines) {
      if (line.includes('|') && !['验证用例', '---', '期望结果'].some(k => line.includes(k))) {
        const parts = line.split('|').map(p => p.strip());
        if (parts.length > 2 && parts[1]) {
          const clean = parts[1].replace(/`/g, '').strip();
          const cleanResult = parts[2] ? parts[2].replace(/`/g, '').strip() : '';
          // 排除占位字眼
          if (clean && !['无', '暂无', '待填写'].includes(clean) && !['无', '暂无', '待填写'].includes(cleanResult)) {
            regressionGuardLines.push(clean);
          }
        }
      }
    }
  }

  if (regressionGuardLines.length === 0) {
    process.stderr.write(`❌ 门禁拦截：架构契约「回归护栏」为空（或只填写了\"无\"），必须指定具体的既有回归用例或手动验证路径！\n`);
    process.exit(1);
  }

  // 5. 校验 Git 分支与 worktree 状态是否正常
  let currentBranch: string;
  try {
    currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (err) {
    process.stderr.write(`❌ 门禁拦截：Git 环境异常，${(err as Error).message}\n`);
    process.exit(1);
  }

  if (!currentBranch.startsWith('sub-')) {
    process.stderr.write(`❌ 门禁拦截：当前分支 ${currentBranch} 不是 sub- 分支，无法安全编码。\n`);
    process.exit(1);
  }

  // 所有门禁均完美通过！
  process.stdout.write(
    JSON.stringify({
      ok: true,
      passed: true,
      docsDir,
      branch: currentBranch,
      whitelistCount: whitelistPaths.length,
      guardCount: regressionGuardLines.length,
      hint: `🎉 编码前 precheck 门禁全部通过！[契约完整 ∧ 0占位符 ∧ 白名单非空 ∧ 回归护栏非空 (${regressionGuardLines.length}项)]，允许派发 coding agent 开始编码！`,
    }) + '\n'
  );
}

// 辅助方法：兼容 String.prototype.trim
declare global {
  interface String {
    strip(): string;
  }
}
String.prototype.strip = function (this: string) {
  return this.trim();
};
