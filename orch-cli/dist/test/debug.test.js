"use strict";
/**
 * 回归测试：Debug CLI 与配置默认值
 *
 * 覆盖：
 *   1. workflowGates.debug 缺省 → block
 *   2. workflowGates.debug 显式 warn/off/block → 原样返回
 *   3. debug-allow-temp-log --dry-run 输出授权信息
 *   4. debug-clean-check 忽略 docs 中的历史标记，但拦截源码残留
 *   5. debug-comment --dry-run 不触发 gh，只输出评论目标
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
const debug_1 = require("../lib/debug");
const CLI = '/Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js';
function makeTmpCwd(configExtra = {}) {
    const dir = (0, node_path_1.join)((0, node_os_1.tmpdir)(), `debug-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    (0, node_fs_1.mkdirSync)((0, node_path_1.join)(dir, '.orch'), { recursive: true });
    const config = {
        repo: 'test/repo',
        baseBranch: 'origin/main',
        ...configExtra,
    };
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(dir, '.orch', 'config.json'), JSON.stringify(config));
    return dir;
}
function runCli(cwd, args) {
    return (0, node_child_process_1.spawnSync)('node', [CLI, ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, ORCH_PHASE_ISSUE: undefined },
    });
}
(0, node_test_1.describe)('Debug 配置默认值', () => {
    (0, node_test_1.it)('workflowGates.debug 缺省 → block', () => {
        strict_1.default.equal((0, debug_1.getDebugGatePolicy)({ repo: 'x/y', baseBranch: 'origin/main' }), 'block');
    });
    for (const policy of ['block', 'warn', 'off']) {
        (0, node_test_1.it)(`workflowGates.debug="${policy}" → ${policy}`, () => {
            strict_1.default.equal((0, debug_1.getDebugGatePolicy)({
                repo: 'x/y',
                baseBranch: 'origin/main',
                workflowGates: { debug: policy },
            }), policy);
        });
    }
});
(0, node_test_1.describe)('Debug CLI', () => {
    (0, node_test_1.it)('debug-allow-temp-log --dry-run 输出授权信息', () => {
        const cwd = makeTmpCwd();
        try {
            const result = runCli(cwd, ['debug-allow-temp-log', '--sub', '7', '--path', 'src/foo.ts', '--reason', '定位旧代码状态', '--dry-run']);
            strict_1.default.equal(result.status, 0, `期望 exit 0，实际=${result.status}\nstderr=${result.stderr}`);
            const parsed = JSON.parse(result.stdout.trim());
            strict_1.default.equal(parsed.dryRun, true);
            strict_1.default.equal(parsed.willAllow.path, 'src/foo.ts');
            strict_1.default.equal(parsed.requiredMarker, 'ORCH_DEBUG_TEMP:7:<attempt>');
        }
        finally {
            (0, node_fs_1.rmSync)(cwd, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)('debug-clean-check 忽略 docs 中的历史标记，但拦截源码残留', () => {
        const cwd = makeTmpCwd();
        try {
            (0, node_fs_1.mkdirSync)((0, node_path_1.join)(cwd, 'docs', 'feature', 'phase-1', '7'), { recursive: true });
            (0, node_fs_1.mkdirSync)((0, node_path_1.join)(cwd, 'src'), { recursive: true });
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(cwd, 'docs', 'feature', 'phase-1', '7', 'debug-report.md'), '历史证据 ORCH_DEBUG_TEMP:7:1\n');
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(cwd, 'src', 'foo.ts'), 'export const ok = true;\n');
            const pass = runCli(cwd, ['debug-clean-check', '--sub', '7']);
            strict_1.default.equal(pass.status, 0, `docs 中的标记不应阻断\nstdout=${pass.stdout}\nstderr=${pass.stderr}`);
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(cwd, 'src', 'foo.ts'), 'console.log("ORCH_DEBUG_TEMP:7:2");\n');
            const fail = runCli(cwd, ['debug-clean-check', '--sub', '7']);
            strict_1.default.equal(fail.status, 1, `源码残留应阻断\nstdout=${fail.stdout}\nstderr=${fail.stderr}`);
            strict_1.default.match(fail.stderr, /src\/foo\.ts/);
        }
        finally {
            (0, node_fs_1.rmSync)(cwd, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)('debug-comment --dry-run 不触发 gh，只输出评论目标', () => {
        const cwd = makeTmpCwd();
        try {
            (0, node_fs_1.mkdirSync)((0, node_path_1.join)(cwd, 'docs'), { recursive: true });
            (0, node_fs_1.writeFileSync)((0, node_path_1.join)(cwd, 'docs', 'debug-report.md'), '# Debug 诊断报告\n');
            const result = runCli(cwd, ['debug-comment', '--sub', '7', '--report', 'docs/debug-report.md', '--dry-run']);
            strict_1.default.equal(result.status, 0, `期望 exit 0，实际=${result.status}\nstderr=${result.stderr}`);
            const parsed = JSON.parse(result.stdout.trim());
            strict_1.default.equal(parsed.dryRun, true);
            strict_1.default.equal(parsed.repo, 'test/repo');
            strict_1.default.equal(parsed.subIssue, 7);
        }
        finally {
            (0, node_fs_1.rmSync)(cwd, { recursive: true, force: true });
        }
    });
});
