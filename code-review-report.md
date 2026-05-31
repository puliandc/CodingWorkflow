# CodingWorkflow 代码验收报告

> **验收基准**：[Issue #1 — Epic：统一编排工作流 — 单引擎 orch + 质量纪律注入 + plugin 分发](https://github.com/puliandc/CodingWorkflow/issues/1)
>
> **审查日期**：2026-05-31
>
> **审查范围**：仓库所有文件（含 agents/、commands/、hooks/、orch-cli/ 完整源码与编译输出）

---

## 一、总体结论

| 维度 | 结论 |
|---|---|
| 核心架构符合性 | ✅ 完全符合 Epic 目标架构 |
| 八条质量纪律注入 | ✅ 8/8 全部落地（纪律 8 retro 为可选，已实现） |
| 零硬编码原则 | ⚠️ 存在 1 处残留硬编码（branch-create.ts L146） |
| Plugin 分发完整性 | ✅ plugin.json + marketplace.json 完整 |
| 引擎 CLI 可运行性 | ✅ dist/index.js 编译产物正常，所有子命令均可响应 |
| 代码质量 | ✅ TypeScript 严格模式，错误处理完整，中文注释全面 |
| **整体评级** | **⚠️ 基本通过，存在 1 个需修复的 BUG + 若干改进建议** |

---

## 二、目标架构验收

Issue #1 三、目标架构 要求：

### 文件目录布局验收

| 要求路径 | 实际存在 | 状态 |
|---|---|---|
| `commands/orch.md` | ✅ `commands/orch.md` (9193B, 179行) | **PASS** |
| `agents/arch.md` | ✅ `agents/arch.md` | **PASS** |
| `agents/design.md` | ✅ `agents/design.md` | **PASS** |
| `agents/coding.md` | ✅ `agents/coding.md` | **PASS** |
| `agents/test.md` | ✅ `agents/test.md` | **PASS** |
| `agents/review.md` | ✅ `agents/review.md` | **PASS** |
| `agents/retro.md` (可选) | ✅ `agents/retro.md` | **PASS** |
| `hooks/hooks.json` | ✅ `hooks/hooks.json` | **PASS** |
| `hooks/guard-impl-access.sh` | ✅ 存在 (5662B, 162行) | **PASS** |
| `hooks/validate-commit-msg.sh` | ✅ 存在 (1933B, 76行) | **PASS** |
| `hooks/guard-context-pollution.sh` | ✅ 存在 (3815B, 102行) | **PASS** |
| `orch-cli/dist/index.js` | ✅ 存在，可执行 | **PASS** |
| `.claude-plugin/plugin.json` | ✅ 存在 | **PASS** |
| `.claude-plugin/marketplace.json` | ✅ 存在 | **PASS** |
| `.orch/config.example.json` | ✅ 存在（示例完整） | **PASS** |

> **注**：Issue #1 架构图中未列出 `agents/review.md` 与 `agents/retro.md`，但均为 Epic 质量纪律的组成部分，属于超额交付。

---

## 三、零硬编码原则验收

Issue #1 原则要求："引擎内**零硬编码项目信息**；新项目接入 = 装 plugin + 写一份 `config.json`"。

### ✅ 通过项

- `orch-cli/lib/config.ts`：完整从 `.orch/config.json` 动态加载 `repo`、`baseBranch`、`project`、`commands`、`greenVerdict` 等所有项目配置。
- `orch-cli/lib/constants.ts`：通过 getter 懒加载 config，所有 `REPO`、`OWNER`、`STATUS_FIELD_ID` 等常量均运行时从 config 读取，无静态值。
- `orch-cli/commands/gate.ts`：lint/format/test 命令均从 `config.commands` 读取；三硬判定字符串从 `config.greenVerdict` 读取。
- `hooks/guard-impl-access.sh`：`whitelistEnforcePaths` 从项目 `.orch/config.json` 解析；未接入项目优雅 no-op。
- `hooks/validate-commit-msg.sh`：`commitTypes` 从项目 `.orch/config.json` 读取；未配置时使用兜底默认词。
- `hooks/guard-context-pollution.sh`：有 `.orch/config.json` 才激活门禁，否则透明放行。

### ❌ 发现问题：`branch-create.ts` 残留一处硬编码

**文件**：`orch-cli/commands/branch-create.ts` [第 146 行](file:///Users/jason/Documents/APP/CodingWorkflow/orch-cli/commands/branch-create.ts#L146)

```typescript
// 第 144-146 行：
// phase 分支：基于 origin/main 创建独立 phase worktree
const repoRoot = mainRepoRoot();
const worktreeContainer = join(dirname(repoRoot), '9zsyqss-worktrees');  // ← ❌ 硬编码
const phaseWorktreePath = phaseWorktreePathForBranch(branchName);
```

**问题描述**：`worktreeContainer` 变量被硬编码为 `9zsyqss-worktrees`（原始项目名称残留）。该值仅用于 `mkdir -p` 操作，而实际的 `phaseWorktreePath` 已通过 `phaseWorktreePathForBranch()` 正确从 config 或 repo 名推导——所以此处 `worktreeContainer` 的值对最终结果没有实际影响（因为 `mkdirSync` 使用的是 `phaseWorktreePath`，会自动递归创建上级目录）。但这是一个遗留的语义性问题，代码注释和实际行为不一致，且在 dry-run 输出中也展示了此路径。

**影响等级**：低（功能不受影响，但违反了零硬编码原则，且会在 dry-run 日志中输出混淆信息）。

**修复建议**：

```typescript
// 修复：使用 phaseWorktreePath 的 dirname 代替硬编码
const phaseWorktreePath = phaseWorktreePathForBranch(branchName);
const worktreeContainer = dirname(phaseWorktreePath);
```

---

## 四、八条质量纪律逐条验收

### 纪律 1：白名单确定性拦截 Hook ★★★

**实现文件**：`hooks/guard-impl-access.sh`、`hooks/hooks.json`

**验收要点**：
- ✅ `hooks.json` 正确注册 PreToolUse 钩子，覆盖 3 个 hook 脚本。
- ✅ `guard-impl-access.sh` 实现了双模式：
  - **模式 1**（无 `.precheck-done`）：在编码前阶段，若 `whitelistEnforcePaths` 非空，拦截针对白名单路径的写入操作。
  - **模式 2**（有 `.precheck-done`）：正式编码阶段，解析 `arch.md` 的 `[契约] 文件白名单` 表格，对超出白名单的 Edit/Write 操作执行 `exit 2` 阻断。
- ✅ 无 `.orch/config.json` 时优雅 no-op（不误伤非接入项目）。
- ✅ `exit 2` 机械式阻断（非依赖 agent 自觉），符合"100% 物理阻断"要求。

**缺陷**：`guard-impl-access.sh` 第 22-23 行，解析 `FILE_PATH` 与 `COMMAND` 时，使用 `cut -d'|' -f4` 和 `cut -d'|' -f7`（以 `|||` 为分隔符），但 Python 的 `print` 输出为 `tool_name|||file_path|||command`（3个字段，2个分隔符），`cut -f4` 实际上会取第 4 列，当分隔符是 `|` 时 `|||` 中间有 2 个空列，导致：

```bash
TOOL_NAME=$(echo "$PARSED" | cut -d'|' -f1)  # 正确：第1列
FILE_PATH=$(echo "$PARSED" | cut -d'|' -f4)  # ❓ 第4列（||| 后面是第4列）
COMMAND=$(echo "$PARSED"   | cut -d'|' -f7)  # ❓ 第7列
```

Python 输出格式为 `<tool>|||<path>|||<cmd>`，按单字符 `|` 切分后为：`[tool, '', '', path, '', '', cmd]`，f1=tool, f4=path, f7=cmd —— **逻辑实际上正确**，只是阅读时需要了解 `|||` 被拆成 3 个 `|` 分隔符的原理。代码可添加注释说明此解析技巧。

**结论**：✅ **PASS**（核心逻辑正确，建议添加注释提升可读性）

---

### 纪律 2：七项启动摘要 ★★★

**实现文件**：`agents/coding.md`

**验收要点**：
- ✅ 明确标注 `## 质量纪律一：七项启动摘要 (HARD RULE)`。
- ✅ 七项要素完整：目标、验收标准、已知风险、范围边界、冻结表、契约清单、回归护栏。
- ✅ `arch.md` 缺失时强制停止，严禁强行开工。
- ✅ 提供了清晰的格式范式，可被机械化校验。

**结论**：✅ **PASS**

---

### 纪律 3：九类停止条件 ★★★

**实现文件**：`agents/coding.md`

**验收要点**：
- ✅ 明确标注 `## 质量纪律二：九类停止条件 (HARD RULE)`。
- ✅ 九类条件完整（文档缺章节、契约缺三表、缺测试护栏、语义未决、日志未决、默认值未决、回退行为未决、结构并存、越界写入）。
- ✅ 触发时要求在返回值最开头输出 `🚨 NEEDS_USER_INPUT` 标志。
- ✅ 提供了结构化的停止上报报告范式（含停止原因分类 checklist、待用户裁决问题、已完成工作、暂停断点说明）。

**结论**：✅ **PASS**

---

### 纪律 4：架构契约三表 ★★★

**实现文件**：`agents/arch.md`

**验收要点**：
- ✅ 明确三表格式：`[契约] 文件白名单` / `[契约] 冻结表` / `[契约] 回归护栏`。
- ✅ 提供了可被机器解析的 Markdown 表格格式范式。
- ✅ 回归护栏非空约束（HARD RULE）：明确要求若护栏为空必须拒绝交付并上报 `🚨 NEEDS_USER_INPUT`。
- ✅ 严禁修改代码约束（HARD RULE）。
- ✅ `agent` 元数据格式正确（name、description、tools 均已填写）。

**结论**：✅ **PASS**

---

### 纪律 5：真绿 vs 伪绿三硬判定 ★★★

**实现文件**：`orch-cli/commands/gate.ts`、`agents/test.md`

**验收要点（gate.ts）**：
- ✅ 三硬判定实现完整：`exitCode === 0`（判定1）∧ `fullOutput.includes(successString)`（判定2）∧ 无 `errorKeywords` 命中（判定3）。
- ✅ 三项全通过才输出 `passed: true`，任一不过则 `exit 1`（阻断）。
- ✅ 未配置 `commands` 时默认 PASS（合理降级），但有 `hint` 说明。
- ✅ 详细报告输出包含每个命令的 `exitCode`、`codePass`、`successPass`、`noErrors`、`hitKeywords`。

**验收要点（test.md）**：
- ✅ 阶段 B：产出测试方案文档（验收用例清单 + 回归点测试）。
- ✅ 阶段 D：调用 `gate` CLI 进行真绿判定，严禁仅凭 exit 0 宣布 PASS。
- ✅ 明确要求报告中附带门禁命令的判定结果 JSON 片段。

**潜在问题**：`gate.ts` 没有使用 `--sub` 参数（虽然接受该参数但未用于任何逻辑），仅作 `requireInt` 校验。若将来需要基于 sub-issue 路由到对应 worktree 的测试命令，此处需扩展。当前阶段这是合理设计（测试命令从 config 全局读取），但建议添加注释说明。

**结论**：✅ **PASS**

---

### 纪律 6：编码前 precheck 门禁 ★★

**实现文件**：`orch-cli/commands/precheck.ts`、`commands/orch.md`（阶段 C 第1步）

**验收要点**：
- ✅ `precheck.ts` 门禁校验项完整：
  1. arch.md 和 test.md 存在性校验
  2. 占位符校验（`[待填写]`、`TODO`、`TBD` 等正则匹配）
  3. `[契约] 文件白名单` 章节存在性校验
  4. 文件白名单非空校验
  5. `[契约] 回归护栏` 章节存在性校验
  6. 回归护栏非空校验（排除"无/暂无/待填写"）
  7. 当前 Git 分支必须是 `sub-` 开头
- ✅ `orch.md` 阶段 C 明确声明 `# 执行编码前门禁 precheck (HARD RULE)`，precheck 失败严禁派发 coding agent。

**发现 BUG（TypeScript 语法错误）**：

`precheck.ts` 第 92、95、97、98、116、120、121、122 行使用了 `.strip()` 方法（Python 风格）：

```typescript
const lines = whitelistMatch[1].strip().split('\n');   // 第 92 行
const parts = line.split('|').map(p => p.strip());     // 第 95 行
const clean = parts[1].replace(/`/g, '').strip();      // 第 97、98 行
```

TypeScript/JavaScript 原生 `String` 没有 `.strip()` 方法（应为 `.trim()`）。作者在文件末尾（第 166-172 行）通过 `declare global` + `String.prototype.strip` 扩展注入了该方法：

```typescript
String.prototype.strip = function (this: string) {
  return this.trim();
};
```

**评估**：

- 功能上有效（通过 prototype 扩展实现了 `.strip()`），所以编译后的 `precheck.js` 能正常运行。
- **设计问题**：全局 `prototype` 污染是反模式，在多模块环境下可能引发意外副作用。
- **可读性问题**：修改全局内建类型的 prototype 属于反模式，且 TypeScript 的 `declare global` 用于声明外部类型而非实现，此写法混淆了声明与实现。
- **建议**：将所有 `.strip()` 替换为原生 `.trim()`，删除 prototype 扩展代码，可定义纯函数 `const trim = (s: string) => s.trim()` 代替。

**结论**：⚠️ **CONDITIONAL PASS**（功能可用，但存在 prototype 污染的代码质量问题）

---

### 纪律 7：设计验收清单 + 代码量测 ★★

**实现文件**：`agents/design.md`、`agents/review.md`

**验收要点（design.md）**：
- ✅ 明确两类判定类型：`Headless量测` 与 `手动目视`。
- ✅ 提供了完整的格式范式（含期望值、实测值、是否通过列）。
- ✅ 禁止模糊主观字眼（"好看、差不多、合适"等）。
- ✅ 仅在 sub-issue 有 `needs-ui` 标签时派发（`orch.md` 阶段 B 第3步）。

**验收要点（review.md）**：
- ✅ 架构契约白名单核对（HARD RULE）：通过 `git diff --name-only origin/main` 获取改动文件，对比 arch.md 白名单，越界立即 BLOCKED。
- ✅ 设计验收清单核对（HARD RULE）：对 `needs-ui` 任务强制逐条量测，手动目视项必须提供人工判定证据。
- ✅ 代码质量审计：debug 日志、Token 泄露、中文注释要求、PR 分支拓扑校验。

**结论**：✅ **PASS**

---

### 纪律 8：知识沉淀 Retro ★★

**实现文件**：`agents/retro.md`、`commands/orch.md`（阶段 E-2 第3步）

**验收要点**：
- ✅ `retro.md` 明确三章节结构：踩坑记录、根本原因分析、具体防错规则。
- ✅ 阶段 E-2 中通过 `config.enableRetro` 开关控制是否派发 retro agent，优雅降级。
- ✅ 产出路径为 `docs/retro/retro-phase-<N>.md`，可通过 `retroDir` 配置项自定义。
- ✅ 明确禁止引入未验证的主观教训（"要注意、多测试"等套话）。

**注意**：`retro` 对应的是可选功能（Issue #12），配置中需 `enableRetro: true` 才生效。当前 `.orch/config.json` 未启用此选项，属于正常状态。

**结论**：✅ **PASS**

---

## 五、orch 编排状态机验收

### commands/orch.md 整体流程

| 阶段 | 描述 | 状态 |
|---|---|---|
| A0 | 建 Phase 分支与 worktree | ✅ PASS |
| A1 | 拆 sub-issue + 人工确认节点 1 | ✅ PASS |
| B | 设计阶段（arch/test/design agents 派发） | ✅ PASS |
| C | 编码阶段（precheck → coding agent） | ✅ PASS |
| D | 验收阶段（test + review 并行派发） | ✅ PASS |
| E | 创建 sub PR + 暂停等待 | ✅ PASS |
| E-2 | Phase 整体 PR + worktree 清理 + retro | ✅ PASS |

### orch-cli 子命令验收

| 子命令 | 功能 | dry-run 验证 | 状态 |
|---|---|---|---|
| `branch-create` | Phase/Sub 分支创建 + worktree | ✅ 响应正常 | ✅ PASS（见 §三 BUG） |
| `state-init` | Phase 进度文件初始化 | ✅ 响应正常 | ✅ PASS |
| `state-advance` | Sub-issue 状态更新 | ✅ 响应正常 | ✅ PASS |
| `state-next` | 串行路由推导 | ✅ 响应正常 | ✅ PASS |
| `issue-link-sub` | 建立父子 issue 关系（GraphQL） | ✅ 响应正常 | ✅ PASS |
| `project-status` | GitHub Project 状态流转 | ✅ 响应正常 | ✅ PASS |
| `project-priority` | GitHub Project 优先级设置 | ✅ 响应正常 | ✅ PASS |
| `commit-docs` | B/D 阶段文档提交推送 | ✅ 响应正常 | ✅ PASS |
| `pr-create-sub` | Sub-issue PR 创建（含 Stage E 前置校验） | ✅ 响应正常 | ✅ PASS |
| `pr-create-phase` | Phase 整体 PR 创建 | ✅ 响应正常 | ✅ PASS |
| `pr-check-merged` | PR 合并状态查询 | ✅ 响应正常 | ✅ PASS |
| `gate` | 真绿三硬判定 | ✅ 响应正常 | ✅ PASS |
| `precheck` | 编码前契约门禁 | ✅ 响应正常 | ⚠️ 见 §四 纪律6 |
| `worktree-remove` | Phase worktree 清理 | ✅ 响应正常 | ✅ PASS |

### state.ts 状态机核心逻辑

- ✅ `mainRepoRoot()`：通过 `git rev-parse --git-common-dir` 在 linked worktree 中也能定位主仓库根，保证状态文件全局唯一。
- ✅ `withStateLock()`：使用 `mkdirSync` 原子性实现互斥锁，10 秒超时 + `Atomics.wait` 自旋等待，防止多 worktree 并发写状态文件。
- ✅ `saveState()` 使用 write-to-temp-then-rename 原子写入模式，防止半写文件损坏。
- ✅ `validateState()` 对所有字段做类型与枚举值校验，格式非法时抛出中文错误。

---

## 六、Plugin 分发机制验收

### .claude-plugin/ 目录

| 文件 | 内容摘要 | 状态 |
|---|---|---|
| `plugin.json` | name=codingworkflow, version=1.0.0, description, author | ✅ PASS |
| `marketplace.json` | id, name, tagline, description, author, repository, license, tags, minClaudeCodeVersion | ✅ PASS |

**验收**：Plugin 机制与底座模型完全解耦（仅文件分发），符合 Issue #1 第三节"分发方式"要求。

### .orch/config.json 合规性

当前仓库自身的 `.orch/config.json`：
```json
{
  "repo": "puliandc/CodingWorkflow",
  "baseBranch": "origin/main",
  "worktreeDir": "../CodingWorkflow-worktrees"
}
```

- ✅ 具备 `repo`（必填）和 `baseBranch`（必填）。
- ✅ `worktreeDir` 配置正确（插件本身不需要 lint/test 等命令）。
- ⚠️ 未配置 `project`（GitHub Project 集成）、`commitTypes`、`whitelistEnforcePaths`、`commands`、`greenVerdict`——这对本仓库自身而言是合理的最小配置，但若希望对本仓库启用 orch 工作流，需补充这些字段。

---

## 七、Issue #1 成功标准逐条验收

| 成功标准 | 验收结果 |
|---|---|
| 一处维护（本仓库），`/plugin update` 即可同步到所有接入项目 | ✅ Plugin 机制完整，仓库即为单一真相来源 |
| 引擎零硬编码；新项目接入只需一份 `config.json` | ⚠️ `branch-create.ts:146` 有 1 处残留硬编码（低影响） |
| 八条质量纪律可被引擎强制执行（而非依赖 agent 自觉） | ✅ 纪律 1/5/6 已实现机械式强制；纪律 2/3/4/7/8 通过 HARD RULE 指令强制 |
| 未接入项目中 guard hook 优雅 no-op、不误伤 | ✅ 三个 hook 均检查 `.orch/config.json` 存在性，不存在则 `exit 0` |

---

## 八、代码质量综合评估

### 优点

1. **TypeScript 严格模式**：`tsconfig.json` 开启 `strict: true`，类型安全得到保障。
2. **一致的 I/O 约定**：所有 CLI 子命令统一 stdout JSON、stderr 中文错误、非零退出码的输出规范。
3. **全中文注释与输出**：符合 Issue #1 "中文提交日志、中文错误信息" 要求。
4. **原子写入与并发锁**：`saveState` 的 tmp-then-rename 模式和 `withStateLock` 确保了状态文件的一致性。
5. **优雅降级设计**：无 config.json 时 hook 放行、无 commands 时 gate 默认 PASS、无 retro 配置时跳过——不误伤非接入场景。
6. **幂等性设计**：`commit-docs` 检测无变更时静默跳过；`project-status` 中 `ensureInProject` 已存在时忽略错误。

### 改进建议

| 优先级 | 问题描述 | 位置 | 建议 |
|---|---|---|---|
| 🔴 高 | `branch-create.ts` 硬编码 `9zsyqss-worktrees` | `branch-create.ts:146` | 替换为 `dirname(phaseWorktreePath)` |
| 🟡 中 | `precheck.ts` 全局 prototype 污染（`String.prototype.strip`） | `precheck.ts:166-172` | 替换为原生 `.trim()` 调用 |
| 🟡 中 | `orch-cli/index.ts` 帮助信息路径有误（显示 `tsx scripts/orch-cli/...` 而非 `node dist/...`） | `index.ts:3,33` | 更正帮助信息中的调用路径 |
| 🟢 低 | `guard-impl-access.sh` 第 22-23 行解析技巧（`|||` → cut -f4,7）缺乏注释 | `guard-impl-access.sh:22-23` | 添加解释注释 |
| 🟢 低 | `gate.ts` 的 `--sub` 参数接受但未使用，缺少注释说明 | `gate.ts:11` | 添加注释说明设计意图 |
| 🟢 低 | `state-next.ts` 引用了 `STATE_FILE`（会在模块加载时固化路径），在有多个 phase 文件的场景下 dry-run 输出可能不准确 | `state-next.ts:54` | 改为在 `run()` 函数内动态获取 |

---

## 九、子 Issue 路线图验收（#2~#12 进度追踪）

根据 git 提交历史，所有子 Issue 均已按顺序交付：

| 子 Issue | 描述 | 提交 | 状态 |
|---|---|---|---|
| #2 | MVP：最小引擎端到端跑通 | `93ed1a9` | ✅ 已交付 |
| #3 | 架构契约三表 + arch agent 模板 | `18f452f` | ✅ 已交付 |
| #4 | coding agent：七项启动摘要 + 九类停止条件 | `e3de760` | ✅ 已交付 |
| #5 | 白名单确定性拦截 hook | `0eb05e0` | ✅ 已交付 |
| #6 | 真绿/伪绿 gate + test agent | `9c0205b` | ✅ 已交付 |
| #7 | 编码前 precheck 门禁 | `d9dd931` | ✅ 已交付 |
| #8 | design 验收清单 + design agent | `cdfddbd` | ✅ 已交付 |
| #9 | 通用 guard hooks：commit-msg + context-pollution | `f0fb238` | ✅ 已交付 |
| #10 | plugin 打包完善 + 本地 marketplace + README + config 模板 | `1bc01dc` | ✅ 已交付 |
| #12 | retro 知识沉淀机制（可选） | `adf2dfa` | ✅ 已交付 |

> **注**：#11（接入 P1914）和 #13（接入 9zsyqss）为接入类 Issue，Issue #1 原文明确"在我明确发起前**不改动现有工作流**"，故不在本次验收范围。

---

## 十、总结与行动项

### 必须修复（阻塞性）

无（所有 Bug 均为低影响，不阻塞正常使用）。

### 建议修复（高优先级）

1. **`branch-create.ts:146`**：将 `'9zsyqss-worktrees'` 硬编码替换为 `dirname(phaseWorktreePath)` —— 违反 Epic 零硬编码核心原则。

2. **`precheck.ts:166-172`**：删除 `String.prototype.strip` 全局污染，替换为原生 `.trim()` 方法。

### 建议改进（低优先级）

3. `orch-cli/index.ts:3,33`：修正帮助信息中调用路径（`tsx scripts/orch-cli/...` → `node orch-cli/dist/...`）。
4. 各 hooks 添加解释性注释提升可读性。
5. `gate.ts` `--sub` 参数添加注释说明当前未使用的原因与未来扩展意图。

---

*报告生成时间：2026-05-31 | 审查者：Antigravity AI*
