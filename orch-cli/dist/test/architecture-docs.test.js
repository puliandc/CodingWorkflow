"use strict";
/**
 * 回归测试：architecture-docs-check 与 post-merge dry-run 集成
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
const CLI = '/Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js';
function makeTmpCwd(configExtra = {}) {
    const dir = (0, node_path_1.join)((0, node_os_1.tmpdir)(), `architecture-docs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    (0, node_fs_1.mkdirSync)((0, node_path_1.join)(dir, '.orch', 'phases'), { recursive: true });
    (0, node_fs_1.mkdirSync)((0, node_path_1.join)(dir, 'docs', 'architecture'), { recursive: true });
    const config = {
        repo: 'test/repo',
        baseBranch: 'origin/main',
        architectureDocs: {
            enabled: true,
            dir: 'docs/architecture',
            uncertaintyPolicy: 'conservative-update',
        },
        ...configExtra,
    };
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(dir, '.orch', 'config.json'), JSON.stringify(config));
    const map = {
        rules: {
            'agents/': ['flow.md', 'module-map.md'],
            'commands/': ['flow.md'],
            'orch-cli/lib/': ['module-map.md'],
        },
        ignoredPrefixes: [
            'docs/architecture/',
            'docs/retro/',
            'docs/triage/',
            'orch-cli/test/',
        ],
        ignoredPatterns: [
            '^docs/[^/]+/phase-\\d+/',
        ],
        conservativeTarget: 'changelog.md',
    };
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(dir, 'docs', 'architecture', 'maintenance-map.json'), JSON.stringify(map));
    const state = {
        phaseIssue: 123,
        phaseBranch: 'phase-1-demo-#123',
        featureName: 'demo',
        phaseWorktreePath: dir,
        subIssues: [],
    };
    (0, node_fs_1.writeFileSync)((0, node_path_1.join)(dir, '.orch', 'phases', 'phase-123.json'), JSON.stringify(state));
    return dir;
}
function runCli(cwd, args) {
    const result = (0, node_child_process_1.spawnSync)('node', [CLI, ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, ORCH_PHASE_ISSUE: '123' },
    });
    let parsed = null;
    try {
        parsed = JSON.parse((result.stdout ?? '').trim());
    }
    catch {
        // 非 JSON 时由断言输出原始 stdout/stderr。
    }
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}
(0, node_test_1.describe)('architecture-docs-check', () => {
    (0, node_test_1.it)('路径映射命中时返回 update-required 和目标文档', () => {
        const cwd = makeTmpCwd();
        try {
            const { status, stdout, stderr, parsed } = runCli(cwd, [
                'architecture-docs-check',
                '--phase-issue',
                '123',
                '--dry-run',
                '--changed-files',
                'agents/arch.md',
            ]);
            strict_1.default.equal(status, 0, `stdout=${stdout}\nstderr=${stderr}`);
            strict_1.default.equal(parsed?.decision, 'update-required');
            strict_1.default.deepEqual(parsed?.matchedFiles, ['agents/arch.md']);
            strict_1.default.ok(parsed?.targetDocs.includes('docs/architecture/flow.md'));
            strict_1.default.ok(parsed?.targetDocs.includes('docs/architecture/module-map.md'));
        }
        finally {
            (0, node_fs_1.rmSync)(cwd, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)('测试文件、历史报告、普通 Phase 文档变更返回 no-op', () => {
        const cwd = makeTmpCwd();
        try {
            const { status, stdout, stderr, parsed } = runCli(cwd, [
                'architecture-docs-check',
                '--phase-issue',
                '123',
                '--dry-run',
                '--changed-files',
                'orch-cli/test/state.test.ts,docs/retro/retro-phase-1.md,docs/demo/phase-1/456/arch.md',
            ]);
            strict_1.default.equal(status, 0, `stdout=${stdout}\nstderr=${stderr}`);
            strict_1.default.equal(parsed?.decision, 'no-op');
            strict_1.default.deepEqual(parsed?.targetDocs, []);
            strict_1.default.deepEqual(parsed?.unknownFiles, []);
        }
        finally {
            (0, node_fs_1.rmSync)(cwd, { recursive: true, force: true });
        }
    });
    (0, node_test_1.it)('未知路径按保守策略返回 conservative-update', () => {
        const cwd = makeTmpCwd();
        try {
            const { status, stdout, stderr, parsed } = runCli(cwd, [
                'architecture-docs-check',
                '--phase-issue',
                '123',
                '--dry-run',
                '--changed-files',
                'scripts/new-tool.ts',
            ]);
            strict_1.default.equal(status, 0, `stdout=${stdout}\nstderr=${stderr}`);
            strict_1.default.equal(parsed?.decision, 'conservative-update');
            strict_1.default.deepEqual(parsed?.unknownFiles, ['scripts/new-tool.ts']);
            strict_1.default.deepEqual(parsed?.targetDocs, ['docs/architecture/changelog.md']);
        }
        finally {
            (0, node_fs_1.rmSync)(cwd, { recursive: true, force: true });
        }
    });
});
(0, node_test_1.describe)('post-merge dry-run', () => {
    (0, node_test_1.it)('输出架构文档同步检查步骤且不修改文件', () => {
        const cwd = makeTmpCwd();
        try {
            const { status, stdout, stderr, parsed } = runCli(cwd, [
                'post-merge',
                '--phase-issue',
                '123',
                '--dry-run',
            ]);
            strict_1.default.equal(status, 0, `stdout=${stdout}\nstderr=${stderr}`);
            strict_1.default.equal(parsed?.dryRun, true);
            strict_1.default.match(parsed?.hint ?? '', /architecture-docs-check/);
            strict_1.default.match(parsed?.architectureDocsStep ?? '', /architecture-docs-check --phase-issue 123 --dry-run/);
        }
        finally {
            (0, node_fs_1.rmSync)(cwd, { recursive: true, force: true });
        }
    });
});
