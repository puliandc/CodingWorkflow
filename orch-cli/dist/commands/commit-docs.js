"use strict";
/**
 * commit-docs 命令
 * 在 PR 创建前把 sub-issue 对应阶段的文档提交并推送到 sub 分支
 * 修复 issue #68：三文件 / 报告原本没人 commit，导致 sub PR 缺少文档
 *
 * 用法：
 *   tsx scripts/orch-cli/index.ts commit-docs \
 *     --sub <sub-issue编号> \
 *     --stage <B|D> \
 *     [--dry-run]
 *
 * 行为：
 *   - 阶段 B：commit `arch.md` / `test.md` /（如存在）`design.md`
 *   - 阶段 D：commit `review-report.md` / `test-report.md`
 *   - 路径自动从 Phase 级状态文件的 featureName + phaseBranch 推导
 *   - 当前分支必须以 `sub-` 开头，否则拒绝执行
 *   - 没有可提交差异时跳过（幂等，BLOCKED 复跑安全）
 *   - 成功后自动 push 到 origin
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const argv_1 = require("../lib/argv");
const state_1 = require("../lib/state");
/** Stage B 阶段要提交的文档（design 仅在 needs-ui 时存在） */
const STAGE_B_FILES = ['arch.md', 'test.md', 'design.md'];
/** Stage B 阶段必须存在的文档（design 可选） */
const STAGE_B_REQUIRED = ['arch.md', 'test.md'];
/** Stage D 阶段要提交的报告 */
const STAGE_D_FILES = ['review-report.md', 'test-report.md', 'debug-report.md'];
/** Stage D 阶段必须存在的报告（debug-report 仅在触发 Debug 时存在） */
const STAGE_D_REQUIRED = ['review-report.md', 'test-report.md'];
/**
 * 执行 git 命令并返回 stdout
 * @param args git 参数数组
 * @returns trim 后的 stdout
 * @throws 命令失败时抛出包含 stderr 的错误
 */
function git(args) {
    try {
        return (0, node_child_process_1.execFileSync)('git', args, { encoding: 'utf8' }).trim();
    }
    catch (err) {
        const e = err;
        const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() ?? '';
        throw new Error(`git 命令失败：git ${args.join(' ')}\n${stderr || e.message}`);
    }
}
/**
 * 从 phase 分支名解析 phase 编号
 * 分支名格式：`phase-<N>-<slug>-#<phaseIssue>`
 * @param phaseBranch 分支名
 * @returns phase 编号（整数）
 */
function parsePhaseNumber(phaseBranch) {
    const m = phaseBranch.match(/^phase-(\d+)-/);
    if (!m) {
        throw new Error(`无法从 phaseBranch "${phaseBranch}" 解析 phase 编号（期望格式 phase-<N>-...）`);
    }
    return parseInt(m[1], 10);
}
/**
 * 执行 commit-docs 命令
 * @param args 命令行参数数组
 */
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const subNumber = (0, argv_1.requireInt)(parsed, 'sub', '缺少必需参数：--sub <sub-issue 编号>');
    const stageRaw = (0, argv_1.requireString)(parsed, 'stage', '缺少必需参数：--stage <B|D>');
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    if (stageRaw !== 'B' && stageRaw !== 'D') {
        process.stderr.write(`无效的 --stage 值："${stageRaw}"，仅支持 B 或 D\n`);
        process.exit(1);
    }
    const stage = stageRaw;
    // 读取进度文件，拿 featureName + 解析 phase 编号
    let state;
    try {
        state = (0, state_1.loadState)();
    }
    catch (err) {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    }
    let phaseNumber;
    try {
        phaseNumber = parsePhaseNumber(state.phaseBranch);
    }
    catch (err) {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    }
    // 校验该 sub-issue 确实在 state 里
    const subEntry = state.subIssues.find(s => s.number === subNumber);
    if (!subEntry) {
        process.stderr.write(`进度文件中未找到 sub-issue #${subNumber}\n`);
        process.exit(1);
    }
    // 拼接文档目录
    const docsDir = `docs/${state.featureName}/phase-${phaseNumber}/${subNumber}`;
    const absDocsDir = (0, node_path_1.resolve)(process.cwd(), docsDir);
    if (!(0, node_fs_1.existsSync)(absDocsDir)) {
        process.stderr.write(`文档目录不存在：${docsDir}\n请确认 arch/test/design agent 已产出文档\n`);
        process.exit(1);
    }
    // 计算本阶段对应的文件清单（仅保留实际存在的）
    const candidateFiles = stage === 'B' ? STAGE_B_FILES : STAGE_D_FILES;
    const requiredFiles = stage === 'B' ? STAGE_B_REQUIRED : STAGE_D_REQUIRED;
    const existingFiles = [];
    const missingRequired = [];
    for (const fname of candidateFiles) {
        const rel = `${docsDir}/${fname}`;
        if ((0, node_fs_1.existsSync)((0, node_path_1.resolve)(process.cwd(), rel))) {
            existingFiles.push(rel);
        }
        else if (requiredFiles.includes(fname)) {
            missingRequired.push(rel);
        }
    }
    if (missingRequired.length > 0) {
        process.stderr.write(`阶段 ${stage} 必需文档缺失，无法提交：\n` +
            missingRequired.map(f => `  - ${f}`).join('\n') + '\n' +
            `请确认对应 agent（arch/test/review）已写入文件\n`);
        process.exit(1);
    }
    // 校验当前分支：必须是 sub 分支（不能是 main / phase 分支）
    let currentBranch;
    try {
        currentBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    }
    catch (err) {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    }
    if (!currentBranch.startsWith('sub-')) {
        process.stderr.write(`当前分支 "${currentBranch}" 不是 sub 分支（期望以 "sub-" 开头）\n` +
            `请先切到对应 sub-issue 的分支再运行 commit-docs\n`);
        process.exit(1);
    }
    // 提交信息模板（中文）
    const stageDesc = stage === 'B' ? '三文件锁定' : '验收报告';
    const commitMsg = `docs(orch): sub #${subNumber} 阶段 ${stage} ${stageDesc}`;
    if (dryRun) {
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            subIssue: subNumber,
            stage,
            branch: currentBranch,
            docsDir,
            willAdd: existingFiles,
            commitMessage: commitMsg,
            steps: [
                `git add ${existingFiles.join(' ')}`,
                `git diff --cached --quiet -- ${docsDir} (检查是否有变更)`,
                `git commit -m "${commitMsg}" (若有变更)`,
                `git push origin ${currentBranch} (若有变更)`,
            ],
            hint: `将提交阶段 ${stage} 文档到分支 ${currentBranch}`,
        }) + '\n');
        return;
    }
    // git add 仅限本 sub 的文档目录文件（不污染源码改动）
    try {
        git(['add', ...existingFiles]);
    }
    catch (err) {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    }
    // 检查是否有暂存差异
    let hasChanges = false;
    try {
        (0, node_child_process_1.execFileSync)('git', ['diff', '--cached', '--quiet', '--', docsDir], { encoding: 'utf8' });
        hasChanges = false;
    }
    catch {
        // 退出码 1 表示有差异
        hasChanges = true;
    }
    if (!hasChanges) {
        process.stdout.write(JSON.stringify({
            ok: true,
            skipped: true,
            reason: '无文档变更需要提交',
            subIssue: subNumber,
            stage,
            branch: currentBranch,
            hint: `阶段 ${stage} 文档已是最新状态，跳过 commit`,
        }) + '\n');
        return;
    }
    // 提交
    let commitSha;
    try {
        git(['commit', '-m', commitMsg]);
        commitSha = git(['rev-parse', 'HEAD']);
    }
    catch (err) {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    }
    // 推送
    try {
        git(['push', 'origin', currentBranch]);
    }
    catch (err) {
        process.stderr.write(`commit 已生成但 push 失败，请手动重试：\n${err.message}\n`);
        process.exit(1);
    }
    process.stdout.write(JSON.stringify({
        ok: true,
        subIssue: subNumber,
        stage,
        branch: currentBranch,
        docsDir,
        committedFiles: existingFiles,
        commitSha,
        commitMessage: commitMsg,
        hint: `已提交并推送阶段 ${stage} 文档（${existingFiles.length} 个文件）到 ${currentBranch}`,
    }) + '\n');
}
