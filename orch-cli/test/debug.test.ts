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

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDebugGatePolicy } from '../lib/debug';

const CLI = '/Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js';

function makeTmpCwd(configExtra: Record<string, unknown> = {}): string {
  const dir = join(tmpdir(), `debug-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.orch'), { recursive: true });
  const config = {
    repo: 'test/repo',
    baseBranch: 'origin/main',
    ...configExtra,
  };
  writeFileSync(join(dir, '.orch', 'config.json'), JSON.stringify(config));
  return dir;
}

function runCli(cwd: string, args: string[]) {
  return spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ORCH_PHASE_ISSUE: undefined as any },
  });
}

describe('Debug 配置默认值', () => {
  it('workflowGates.debug 缺省 → block', () => {
    assert.equal(getDebugGatePolicy({ repo: 'x/y', baseBranch: 'origin/main' }), 'block');
  });

  for (const policy of ['block', 'warn', 'off'] as const) {
    it(`workflowGates.debug="${policy}" → ${policy}`, () => {
      assert.equal(getDebugGatePolicy({
        repo: 'x/y',
        baseBranch: 'origin/main',
        workflowGates: { debug: policy },
      }), policy);
    });
  }
});

describe('Debug CLI', () => {
  it('debug-allow-temp-log --dry-run 输出授权信息', () => {
    const cwd = makeTmpCwd();
    try {
      const result = runCli(cwd, ['debug-allow-temp-log', '--sub', '7', '--path', 'src/foo.ts', '--reason', '定位旧代码状态', '--dry-run']);
      assert.equal(result.status, 0, `期望 exit 0，实际=${result.status}\nstderr=${result.stderr}`);
      const parsed = JSON.parse(result.stdout.trim());
      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.willAllow.path, 'src/foo.ts');
      assert.equal(parsed.requiredMarker, 'ORCH_DEBUG_TEMP:7:<attempt>');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('debug-clean-check 忽略 docs 中的历史标记，但拦截源码残留', () => {
    const cwd = makeTmpCwd();
    try {
      mkdirSync(join(cwd, 'docs', 'feature', 'phase-1', '7'), { recursive: true });
      mkdirSync(join(cwd, 'src'), { recursive: true });
      writeFileSync(join(cwd, 'docs', 'feature', 'phase-1', '7', 'debug-report.md'), '历史证据 ORCH_DEBUG_TEMP:7:1\n');
      writeFileSync(join(cwd, 'src', 'foo.ts'), 'export const ok = true;\n');

      const pass = runCli(cwd, ['debug-clean-check', '--sub', '7']);
      assert.equal(pass.status, 0, `docs 中的标记不应阻断\nstdout=${pass.stdout}\nstderr=${pass.stderr}`);

      writeFileSync(join(cwd, 'src', 'foo.ts'), 'console.log("ORCH_DEBUG_TEMP:7:2");\n');
      const fail = runCli(cwd, ['debug-clean-check', '--sub', '7']);
      assert.equal(fail.status, 1, `源码残留应阻断\nstdout=${fail.stdout}\nstderr=${fail.stderr}`);
      assert.match(fail.stderr, /src\/foo\.ts/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('debug-comment --dry-run 不触发 gh，只输出评论目标', () => {
    const cwd = makeTmpCwd();
    try {
      mkdirSync(join(cwd, 'docs'), { recursive: true });
      writeFileSync(join(cwd, 'docs', 'debug-report.md'), '# Debug 诊断报告\n');
      const result = runCli(cwd, ['debug-comment', '--sub', '7', '--report', 'docs/debug-report.md', '--dry-run']);
      assert.equal(result.status, 0, `期望 exit 0，实际=${result.status}\nstderr=${result.stderr}`);
      const parsed = JSON.parse(result.stdout.trim());
      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.repo, 'test/repo');
      assert.equal(parsed.subIssue, 7);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
