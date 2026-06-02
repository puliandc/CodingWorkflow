"use strict";
/**
 * 集成测试：gate 命令（来自 commands/gate.ts）
 *
 * 策略：用 spawnSync 跑 `node dist/index.js gate`，
 * 在临时 cwd（带最小 .orch/config.json）验证 exit code 与 JSON 输出。
 *
 * 覆盖：
 *   1. 无 commands 配置 → 默认 PASS（passed:true, exit 0）
 *   2. test 命令必然成功（"true"） → PASS
 *   3. test 命令必然失败（"false"） → exit 1，passed:false
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
// ── 分发的 CLI 入口（已编译） ────────────────────────────────────────────────
const CLI = '/Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js';
// ── 创建最小临时 cwd ─────────────────────────────────────────────────────────
function makeTmpCwd(configExtra = {}) {
    const dir = (0, node_path_1.join)((0, node_os_1.tmpdir)(), `gate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    (0, node_fs_1.mkdirSync)((0, node_path_1.join)(dir, '.orch'), { recursive: true });
    const config = {
        repo: 'test/repo',
        baseBranch: 'origin/main',
        ...configExtra,
    };
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(dir, '.orch', 'config.json'), JSON.stringify(config));
    return dir;
}
// ── 运行 gate 命令，返回 { status, stdout, stderr, parsed } ─────────────────
function runGate(cwd, extraArgs = []) {
    const result = (0, node_child_process_1.spawnSync)('node', [CLI, 'gate', ...extraArgs], {
        cwd,
        encoding: 'utf8',
        // 不继承 ORCH_PHASE_ISSUE 等环境变量，避免干扰
        env: { ...process.env, ORCH_PHASE_ISSUE: undefined },
    });
    let parsed = null;
    try {
        parsed = JSON.parse(result.stdout?.trim() ?? '');
    }
    catch {
        // stdout 不是 JSON 时忽略
    }
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}
// ── 测试套件 ────────────────────────────────────────────────────────────────
(0, node_test_1.describe)('gate 命令', () => {
    (0, node_test_1.it)('1. 无 commands 配置 → 默认 PASS（passed:true, exit 0）', () => {
        const cwd = makeTmpCwd(); // 无 commands
        try {
            const { status, parsed } = runGate(cwd);
            strict_1.default.equal(status, 0, `期望 exit 0，实际=${status}`);
            strict_1.default.equal(parsed?.passed, true, `期望 passed:true，实际=${JSON.stringify(parsed)}`);
        }
        finally {
            (0, node_fs_1.rmSync)(cwd, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)('2. test 命令必然成功（"true"）→ PASS', () => {
        const cwd = makeTmpCwd({ commands: { test: 'true' } });
        try {
            const { status, parsed } = runGate(cwd);
            strict_1.default.equal(status, 0, `期望 exit 0，实际=${status}`);
            strict_1.default.equal(parsed?.passed, true, `期望 passed:true，实际=${JSON.stringify(parsed)}`);
        }
        finally {
            (0, node_fs_1.rmSync)(cwd, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)('3. test 命令必然失败（"false"）→ exit 1，passed:false', () => {
        const cwd = makeTmpCwd({ commands: { test: 'false' } });
        try {
            const { status, stderr } = runGate(cwd);
            strict_1.default.equal(status, 1, `期望 exit 1，实际=${status}`);
            // stderr 应包含 passed:false 的 JSON
            const errJson = JSON.parse(stderr.replace(/^[^{]*/, '').trim());
            strict_1.default.equal(errJson?.passed, false, `期望 passed:false，实际=${JSON.stringify(errJson)}`);
        }
        finally {
            (0, node_fs_1.rmSync)(cwd, { recursive: true, force: true });
        }
    });
});
