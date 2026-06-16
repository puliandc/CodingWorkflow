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

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
function makeInput(opts: { toolName?: string; filePath?: string }): string {
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
function initTmpRepo(): string {
  const base = realpathSync(tmpdir()); // 解析 /tmp → /private/tmp（macOS 兼容）
  const dir = join(base, `hook-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', dir]);
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  return dir;
}

// ── 运行 hook：stdin 喂 JSON，cwd 设为临时仓库 ──────────────────────────────
function runHook(tmpDir: string, inputJson: string) {
  return spawnSync('bash', [HOOK_PATH], {
    input: inputJson,
    cwd: tmpDir,
    encoding: 'utf8',
  });
}

// ── 测试套件 ────────────────────────────────────────────────────────────────

describe('guard-impl-access.sh', () => {
  // 共享临时仓库（a/b/c 三例共用，d 例独立）
  let tmpRepo: string;
  let archMdPath: string;
  let precheckFile: string;

  before(() => {
    tmpRepo = initTmpRepo();

    // 写 .orch/config.json
    const orchDir = join(tmpRepo, '.orch');
    mkdirSync(orchDir, { recursive: true });
    writeFileSync(join(orchDir, 'config.json'), CONFIG_JSON);

    // 写 arch.md
    archMdPath = join(orchDir, 'arch.md');
    writeFileSync(archMdPath, ARCH_MD_CONTENT);

    // 写 .precheck-done，指向 arch.md
    precheckFile = join(tmpRepo, '.precheck-done');
    writeFileSync(precheckFile, archMdPath);
  });

  after(() => {
    if (existsSync(tmpRepo)) {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it('a: Edit 白名单内文件 → exit 0（放行）', () => {
    const allowedPath = join(tmpRepo, 'src', 'allowed.ts');
    const result = runHook(tmpRepo, makeInput({ filePath: allowedPath }));
    assert.equal(result.status, 0, `期望 exit 0，实际=${result.status}\nstderr=${result.stderr}`);
  });

  it('b: Edit 白名单外文件 → exit 2（阻断）', () => {
    const outsidePath = join(tmpRepo, 'src', 'forbidden.ts');
    const result = runHook(tmpRepo, makeInput({ filePath: outsidePath }));
    assert.equal(result.status, 2, `期望 exit 2，实际=${result.status}\nstderr=${result.stderr}`);
  });

  it('c: Debug 清单授权的白名单外临时日志文件 → exit 0（放行）', () => {
    const debugDir = join(tmpRepo, '.orch', 'debug');
    mkdirSync(debugDir, { recursive: true });
    writeFileSync(join(debugDir, 'temp-log-allowlist.json'), JSON.stringify({
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

    const diagnosticPath = join(tmpRepo, 'src', 'diagnostic.ts');
    const result = runHook(tmpRepo, makeInput({ filePath: diagnosticPath }));
    assert.equal(result.status, 0, `期望 exit 0，实际=${result.status}\nstderr=${result.stderr}`);
  });

  it('d: .precheck-done 存在但 arch.md 被删除 → exit 2（fail-closed 回归 #24）', () => {
    // 删除 arch.md
    unlinkSync(archMdPath);

    const filePath = join(tmpRepo, 'src', 'allowed.ts');
    const result = runHook(tmpRepo, makeInput({ filePath }));

    // 恢复 arch.md 供后续（虽 after() 会删整目录，但清晰起见）
    writeFileSync(archMdPath, ARCH_MD_CONTENT);

    assert.equal(result.status, 2, `期望 exit 2（fail-closed），实际=${result.status}\nstderr=${result.stderr}`);
  });

  it('e: 无 .orch/config.json 的目录 → exit 0（优雅 no-op）', () => {
    // 创建无 config 的裸 git 仓库
    const bareRepo = initTmpRepo();
    try {
      const result = runHook(bareRepo, makeInput({ filePath: join(bareRepo, 'any.ts') }));
      assert.equal(result.status, 0, `期望 exit 0，实际=${result.status}\nstderr=${result.stderr}`);
    } finally {
      rmSync(bareRepo, { recursive: true, force: true });
    }
  });
});
