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

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── 分发的 CLI 入口（已编译） ────────────────────────────────────────────────
const CLI = '/Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js';

// ── 创建最小临时 cwd ─────────────────────────────────────────────────────────
function makeTmpCwd(configExtra: Record<string, unknown> = {}): string {
  const dir = join(tmpdir(), `gate-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.orch'), { recursive: true });
  const config = {
    repo: 'test/repo',
    baseBranch: 'origin/main',
    ...configExtra,
  };
  writeFileSync(join(dir, '.orch', 'config.json'), JSON.stringify(config));
  return dir;
}

// ── 运行 gate 命令，返回 { status, stdout, stderr, parsed } ─────────────────
function runGate(cwd: string, extraArgs: string[] = []) {
  const result = spawnSync('node', [CLI, 'gate', ...extraArgs], {
    cwd,
    encoding: 'utf8',
    // 不继承 ORCH_PHASE_ISSUE 等环境变量，避免干扰
    env: { ...process.env, ORCH_PHASE_ISSUE: undefined as any },
  });

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(result.stdout?.trim() ?? '');
  } catch {
    // stdout 不是 JSON 时忽略
  }

  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}

// ── 测试套件 ────────────────────────────────────────────────────────────────

describe('gate 命令', () => {
  it('1. 无 commands 配置 → 默认 PASS（passed:true, exit 0）', () => {
    const cwd = makeTmpCwd(); // 无 commands
    try {
      const { status, parsed } = runGate(cwd);
      assert.equal(status, 0, `期望 exit 0，实际=${status}`);
      assert.equal((parsed as any)?.passed, true, `期望 passed:true，实际=${JSON.stringify(parsed)}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('2. test 命令必然成功（"true"）→ PASS', () => {
    const cwd = makeTmpCwd({ commands: { test: 'true' } });
    try {
      const { status, parsed } = runGate(cwd);
      assert.equal(status, 0, `期望 exit 0，实际=${status}`);
      assert.equal((parsed as any)?.passed, true, `期望 passed:true，实际=${JSON.stringify(parsed)}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('3. test 命令必然失败（"false"）→ exit 1，passed:false', () => {
    const cwd = makeTmpCwd({ commands: { test: 'false' } });
    try {
      const { status, stderr } = runGate(cwd);
      assert.equal(status, 1, `期望 exit 1，实际=${status}`);
      // stderr 应包含 passed:false 的 JSON
      const errJson = JSON.parse(stderr.replace(/^[^{]*/, '').trim());
      assert.equal(errJson?.passed, false, `期望 passed:false，实际=${JSON.stringify(errJson)}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
