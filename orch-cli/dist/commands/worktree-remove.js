"use strict";
/**
 * worktree-remove 命令
 * 在 Phase PR 被 GitHub 合并后，清理对应的本地 phase worktree 与本地 phase 分支。
 *
 * 用法：
 *   tsx scripts/orch-cli/index.ts worktree-remove [--phase-issue <N>] [--dry-run]
 *
 * 注意：sub-issue 不再拥有独立 worktree，--sub 已废弃并会直接失败。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const argv_1 = require("../lib/argv");
const state_1 = require("../lib/state");
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
function optionalInt(value) {
    if (typeof value === 'undefined')
        return null;
    const n = parseInt(String(value), 10);
    return Number.isInteger(n) ? n : null;
}
function run(args) {
    const parsed = (0, argv_1.parseArgs)(args);
    const dryRun = (0, argv_1.flag)(parsed, 'dry-run');
    if (typeof parsed['sub'] !== 'undefined') {
        process.stderr.write('sub-issue 不再拥有独立 worktree；请在 Phase PR 合并后运行 `worktree-remove --phase-issue <N>` 清理 phase worktree。\n');
        process.exit(1);
    }
    const phaseIssue = optionalInt(parsed['phase-issue']);
    if (phaseIssue !== null) {
        process.env.ORCH_PHASE_ISSUE = String(phaseIssue);
    }
    let state;
    try {
        state = (0, state_1.loadState)();
    }
    catch (err) {
        process.stderr.write(err.message + '\n');
        process.exit(1);
    }
    const worktreePath = state.phaseWorktreePath;
    const branchName = state.phaseBranch;
    if (dryRun) {
        const steps = worktreePath
            ? [
                `git worktree remove --force ${worktreePath}`,
                `（若目录残留）rmSync(${worktreePath}, { recursive: true, force: true })`,
                `git worktree prune`,
                `git branch -d ${branchName}`,
                `withStateLock: state.phaseWorktreePath = null → saveState()`,
            ]
            : [
                '（phaseWorktreePath 已为 null，跳过目录清理）',
                `git branch -d ${branchName}`,
            ];
        process.stdout.write(JSON.stringify({
            ok: true,
            dryRun: true,
            phaseIssue: state.phaseIssue,
            phaseWorktreePath: worktreePath,
            branchName,
            steps,
            hint: 'dry-run 模式，以上步骤均未实际执行。去掉 --dry-run 后正式运行。',
        }) + '\n');
        return;
    }
    const warnings = [];
    let branchDeleted = false;
    if (worktreePath) {
        try {
            git(['worktree', 'remove', '--force', worktreePath]);
        }
        catch (err) {
            warnings.push(`git worktree remove 失败（可能已不在注册列表中）：${err.message}`);
        }
        if ((0, node_fs_1.existsSync)(worktreePath)) {
            try {
                (0, node_fs_1.rmSync)(worktreePath, { recursive: true, force: true });
                try {
                    git(['worktree', 'prune']);
                }
                catch (pruneErr) {
                    warnings.push(`git worktree prune 失败：${pruneErr.message}`);
                }
            }
            catch (rmErr) {
                warnings.push(`rmSync 兜底删除目录失败：${rmErr.message}`);
            }
        }
    }
    try {
        git(['branch', '-d', branchName]);
        branchDeleted = true;
    }
    catch {
        warnings.push(`本地 Phase 分支 "${branchName}" 未能安全删除（git branch -d 失败，可能本地 main 还未合并）。` +
            `如确认已合并，可手动执行：git branch -D ${branchName}`);
    }
    try {
        (0, state_1.withStateLock)(() => {
            const freshState = (0, state_1.loadState)();
            freshState.phaseWorktreePath = null;
            (0, state_1.saveState)(freshState);
        });
    }
    catch (err) {
        warnings.push(`进度文件更新失败（phaseWorktreePath 未置 null）：${err.message}`);
    }
    process.stdout.write(JSON.stringify({
        ok: true,
        phaseIssue: state.phaseIssue,
        removedWorktree: worktreePath,
        branchDeleted,
        warnings,
        hint: warnings.length === 0
            ? `Phase #${state.phaseIssue} 的 worktree 与本地分支已清理完毕，进度文件已更新`
            : `Phase #${state.phaseIssue} 清理完成，但有 ${warnings.length} 条警告，请检查 warnings 字段`,
    }) + '\n');
}
