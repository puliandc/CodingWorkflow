/**
 * 回归测试：architecture-docs-check 与 post-merge dry-run 集成
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = '/Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js';

function makeTmpCwd(configExtra: Record<string, unknown> = {}): string {
  const dir = join(tmpdir(), `architecture-docs-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.orch', 'phases'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'architecture'), { recursive: true });

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
  writeFileSync(join(dir, '.orch', 'config.json'), JSON.stringify(config));

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
  writeFileSync(join(dir, 'docs', 'architecture', 'maintenance-map.json'), JSON.stringify(map));

  const state = {
    phaseIssue: 123,
    phaseBranch: 'phase-1-demo-#123',
    featureName: 'demo',
    phaseWorktreePath: dir,
    subIssues: [],
  };
  writeFileSync(join(dir, '.orch', 'phases', 'phase-123.json'), JSON.stringify(state));

  return dir;
}

function runCli(cwd: string, args: string[]) {
  const result = spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ORCH_PHASE_ISSUE: '123' },
  });

  let parsed: any = null;
  try {
    parsed = JSON.parse((result.stdout ?? '').trim());
  } catch {
    // 非 JSON 时由断言输出原始 stdout/stderr。
  }

  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}

describe('architecture-docs-check', () => {
  it('路径映射命中时返回 update-required 和目标文档', () => {
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

      assert.equal(status, 0, `stdout=${stdout}\nstderr=${stderr}`);
      assert.equal(parsed?.decision, 'update-required');
      assert.deepEqual(parsed?.matchedFiles, ['agents/arch.md']);
      assert.ok(parsed?.targetDocs.includes('docs/architecture/flow.md'));
      assert.ok(parsed?.targetDocs.includes('docs/architecture/module-map.md'));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('测试文件、历史报告、普通 Phase 文档变更返回 no-op', () => {
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

      assert.equal(status, 0, `stdout=${stdout}\nstderr=${stderr}`);
      assert.equal(parsed?.decision, 'no-op');
      assert.deepEqual(parsed?.targetDocs, []);
      assert.deepEqual(parsed?.unknownFiles, []);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('未知路径按保守策略返回 conservative-update', () => {
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

      assert.equal(status, 0, `stdout=${stdout}\nstderr=${stderr}`);
      assert.equal(parsed?.decision, 'conservative-update');
      assert.deepEqual(parsed?.unknownFiles, ['scripts/new-tool.ts']);
      assert.deepEqual(parsed?.targetDocs, ['docs/architecture/changelog.md']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('post-merge dry-run', () => {
  it('输出架构文档同步检查步骤且不修改文件', () => {
    const cwd = makeTmpCwd();
    try {
      const { status, stdout, stderr, parsed } = runCli(cwd, [
        'post-merge',
        '--phase-issue',
        '123',
        '--dry-run',
      ]);

      assert.equal(status, 0, `stdout=${stdout}\nstderr=${stderr}`);
      assert.equal(parsed?.dryRun, true);
      assert.match(parsed?.hint ?? '', /architecture-docs-check/);
      assert.match(parsed?.architectureDocsStep ?? '', /architecture-docs-check --phase-issue 123 --dry-run/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
