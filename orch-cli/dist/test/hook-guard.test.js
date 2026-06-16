"use strict";
/**
 * 集成测试：hooks/guard-impl-access.sh
 *
 * 覆盖（#24 fail-closed 回归）：
 *   a. Edit 白名单内文件 → exit 0（放行）
 *   b. Edit 白名单外文件 → exit 2（阻断）
 *   c. Debug 清单授权的白名单外临时日志文件 → exit 0（放行）
 *   d. .precheck-done 存在但 arch.md 被删除 → exit 2（fail-closed 回归）
 *   e. 无 .orch/config.json → exit 0（优雅 no-op）
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_os_1 = require("node:os");
// ── 钩子脚本绝对路径（相对于仓库根） ──────────────────────────────────────
const HOOK_PATH = '/Users/jason/Documents/APP/CodingWorkflow/hooks/guard-impl-access.sh';
// ── 测试用 arch.md（含白名单表） ─────────────────────────────────────────────
const ARCH_MD_CONTENT = `# arch.md

#### [契约] 文件白名单

| 允许路径 | 变更类型 |
| --- | --- |
| \`src/allowed.ts\` | Edit |

#### [契约] 冻结表

| 冻结路径 | 说明 |
| --- | --- |

#### [契约] 回归护栏

| 验证用例 | 期望结果 |
| --- | --- |
`;
// ── 最小 config.json ─────────────────────────────────────────────────────────
const CONFIG_JSON = JSON.stringify({
    repo: 'test/repo',
    baseBranch: 'origin/main',
});
// ── 构造 hook 输入 JSON ───────────────────────────────────────────────────────
function makeInput(opts) {
    return JSON.stringify({
        tool_name: opts.toolName ?? 'Edit',
        tool_input: {
            file_path: opts.filePath ?? '',
        },
    });
}
// ── 初始化临时 git 仓库 ──────────────────────────────────────────────────────
// 注意：macOS 上 /tmp 是指向 /private/tmp 的符号链接。
// git rev-parse --show-toplevel 返回解析后的真实路径（/private/tmp/...），
// 因此临时目录也必须用 realpathSync 解析，确保前缀能被 hook 正确剥离。
function initTmpRepo() {
    const base = (0, node_fs_1.realpathSync)((0, node_os_1.tmpdir)()); // 解析 /tmp → /private/tmp（macOS 兼容）
    const dir = (0, node_path_1.join)(base, `hook-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    (0, node_fs_1.mkdirSync)(dir, { recursive: true });
    (0, node_child_process_1.execFileSync)('git', ['init', dir]);
    (0, node_child_process_1.execFileSync)('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
    (0, node_child_process_1.execFileSync)('git', ['config', 'user.name', 'Test'], { cwd: dir });
    return dir;
}
// ── 运行 hook：stdin 喂 JSON，cwd 设为临时仓库 ──────────────────────────────
function runHook(tmpDir, inputJson) {
    return (0, node_child_process_1.spawnSync)('bash', [HOOK_PATH], {
        input: inputJson,
        cwd: tmpDir,
        encoding: 'utf8',
    });
}
// ── 测试套件 ────────────────────────────────────────────────────────────────
(0, node_test_1.describe)('guard-impl-access.sh', () => {
    // 共享临时仓库（a/b/c 三例共用，d 例独立）
    let tmpRepo;
    let archMdPath;
    let precheckFile;
    (0, node_test_1.before)(() => {
        tmpRepo = initTmpRepo();
        // 写 .orch/config.json
        const orchDir = (0, node_path_1.join)(tmpRepo, '.orch');
        (0, node_fs_1.mkdirSync)(orchDir, { recursive: true });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(orchDir, 'config.json'), CONFIG_JSON);
        // 写 arch.md
        archMdPath = (0, node_path_1.join)(orchDir, 'arch.md');
        (0, node_fs_1.writeFileSync)(archMdPath, ARCH_MD_CONTENT);
        // 写 .precheck-done，指向 arch.md
        precheckFile = (0, node_path_1.join)(tmpRepo, '.precheck-done');
        (0, node_fs_1.writeFileSync)(precheckFile, archMdPath);
    });
    (0, node_test_1.after)(() => {
        if ((0, node_fs_1.existsSync)(tmpRepo)) {
            (0, node_fs_1.rmSync)(tmpRepo, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)('a: Edit 白名单内文件 → exit 0（放行）', () => {
        const allowedPath = (0, node_path_1.join)(tmpRepo, 'src', 'allowed.ts');
        const result = runHook(tmpRepo, makeInput({ filePath: allowedPath }));
        strict_1.default.equal(result.status, 0, `期望 exit 0，实际=${result.status}\nstderr=${result.stderr}`);
    });
    (0, node_test_1.it)('b: Edit 白名单外文件 → exit 2（阻断）', () => {
        const outsidePath = (0, node_path_1.join)(tmpRepo, 'src', 'forbidden.ts');
        const result = runHook(tmpRepo, makeInput({ filePath: outsidePath }));
        strict_1.default.equal(result.status, 2, `期望 exit 2，实际=${result.status}\nstderr=${result.stderr}`);
    });
    (0, node_test_1.it)('c: Debug 清单授权的白名单外临时日志文件 → exit 0（放行）', () => {
        const debugDir = (0, node_path_1.join)(tmpRepo, '.orch', 'debug');
        (0, node_fs_1.mkdirSync)(debugDir, { recursive: true });
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(debugDir, 'temp-log-allowlist.json'), JSON.stringify({
            version: 1,
            entries: [
                {
                    sub: 12,
                    path: 'src/diagnostic.ts',
                    reason: 'Debug 临时诊断日志',
                    createdAt: new Date().toISOString(),
                },
            ],
        }));
        const diagnosticPath = (0, node_path_1.join)(tmpRepo, 'src', 'diagnostic.ts');
        const result = runHook(tmpRepo, makeInput({ filePath: diagnosticPath }));
        strict_1.default.equal(result.status, 0, `期望 exit 0，实际=${result.status}\nstderr=${result.stderr}`);
    });
    (0, node_test_1.it)('d: .precheck-done 存在但 arch.md 被删除 → exit 2（fail-closed 回归 #24）', () => {
        // 删除 arch.md
        (0, node_fs_1.unlinkSync)(archMdPath);
        const filePath = (0, node_path_1.join)(tmpRepo, 'src', 'allowed.ts');
        const result = runHook(tmpRepo, makeInput({ filePath }));
        // 恢复 arch.md 供后续（虽 after() 会删整目录，但清晰起见）
        (0, node_fs_1.writeFileSync)(archMdPath, ARCH_MD_CONTENT);
        strict_1.default.equal(result.status, 2, `期望 exit 2（fail-closed），实际=${result.status}\nstderr=${result.stderr}`);
    });
    (0, node_test_1.it)('e: 无 .orch/config.json 的目录 → exit 0（优雅 no-op）', () => {
        // 创建无 config 的裸 git 仓库
        const bareRepo = initTmpRepo();
        try {
            const result = runHook(bareRepo, makeInput({ filePath: (0, node_path_1.join)(bareRepo, 'any.ts') }));
            strict_1.default.equal(result.status, 0, `期望 exit 0，实际=${result.status}\nstderr=${result.stderr}`);
        }
        finally {
            (0, node_fs_1.rmSync)(bareRepo, { recursive: true, force: true });
        }
    });
});
