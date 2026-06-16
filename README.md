# 📡 CodingWorkflow — 100% 物理闭环的自演进 AI 软件工程 (AISE) 研发纪律引擎

`CodingWorkflow` 是一款将 **全生命周期 Phase 状态机**、**并发契约语义锁**、**红蓝混沌负向防御**、**APM 遥测数据热回灌** 与 **规则自愈编译器** 深度融合的跨项目通用 AISE 研发纪律引擎。

传统的 AI 辅助开发依赖于 Agent 的"自觉性"和主观提示词，这在工业级多分支协作、敏感路径越界、复杂时效决策和上线稳定性要求极高的生产环境中极易崩溃。`CodingWorkflow` 通过**严密的物理机制、硬性门禁与运行时信号反哺**，将 AI 编程牢牢锁入物理轨道。

---

## 🧭 这个仓库到底是什么

`CodingWorkflow` 不是业务应用，也不是单个项目的脚手架。它是一个可分发的本地工作流底座，用来把 Claude Code / Codex 这类代码代理约束到可审计、可回归、可中断的工程流程中。

仓库中有四类核心资产：

| 资产 | 目录 | 作用 |
|---|---|---|
| Claude Code 插件清单 | `.claude-plugin/` | 声明插件名 `codingworkflow`、本地 marketplace、`/orch` 与 `/debug` 命令、13 个阶段 agent |
| 编排提示词 | `commands/`、`agents/` | 定义 Phase 0 到 E-2 的主流程、Debug 流程，以及 triage/probing/adr/arch/coding/test/review/chaos/release/retro 等角色职责 |
| 物理执行层 | `orch-cli/` | TypeScript CLI，负责创建 worktree、推进状态、注册契约、执行 precheck/gate、创建 PR、处理 post-merge 与 telemetry 回灌 |
| 硬门禁 Hook | `hooks/` | Claude PreToolUse hook：白名单写入拦截、提交信息格式校验、上下文防污染拦截 |

设计上的单一真相是：人类/主会话通过 `/orch` 和 `/debug` 驱动流程，命令提示词负责调度代理，代理产出设计/测试/发布文档，`orch-cli` 负责确定性门禁与状态变更，hook 负责在代理写码时做最后一道物理拦截。

---

## 🚀 核心架构与物理落地成果

### 1. 100% 物理闭环全生命周期状态机 (Phase 0 ~ E-2)
引擎提供覆盖软件研发完整闭环的六大流程控制，利用独立 Worktree 进行物理隔离：
- **Phase 0：需求准入与分类 (`intake-check` 门禁)**
  派发 `triage` 分析 Issue 的清晰度和可执行度，产出准入决策 `[GO | NO-GO | DISCOVERY]`，`[NO-GO]` 级直接物理阻断工作流。
- **Phase A0 ~ A1：现状探照与防撞车扫描 (`probing`)**
  派发只读 `probing` 全库扫描存量相似实现及三方库，强迫 AI 复用已有资产，严禁重复造核心轮子。
- **Phase B：设计、方案 ADR 双选与契约锁定**
  派发 `adr`、`arch` 和 `test` 产出技术设计，强制记录 Trade-offs 被放弃方案与未来反悔指标；登记当前任务对核心代码的读写契约。
- **Phase C：编码前门禁校验与受控编码 (`precheck` 门禁)**
  编码前强校验 [准入-探波-ADR-契约-并发锁-数据库迁移-分支命名] 等门禁，通过后派发受控 `coding` 在隔离 worktree 限制白名单内写码。
- **Phase D：真绿三硬判定、设计验收与红蓝混沌防御**
  三硬判定拒绝"伪绿"通过；若 D 阶段 `gate` 失败且 `workflowGates.debug` 未关闭，自动拉起 `debug` 进行临时日志诊断、无头复现、Issue 证据评论与修复计划等待确认；派发 `chaos` 针对高并发、三方接口挂掉、异常吞噬等注入破坏性缺陷，审查防御性代码，未通过 `chaos-gate` 则物理拦截。
- **Phase E：发布与回退 Runbook 硬核审计**
  派发 `release` 生成 Feature Flag、生产一键回退 Runbook 及 Schema 补偿，`release-check` 门禁执行发布计划强核对。
- **Phase E-2：Post-Merge 交付校验、Retro 知识沉淀与系统免疫**
  主干健康拉取验证，项目看板自动结单关闭；派发 `retro` 复盘及 `guardrail-compiler` 动态编译更新配置与拦截 Hook。

### 2. 🛡️ 并发契约语义锁 (Semantic Locking)
为了解决多分支并行开发时的代码冲突与踩踏：
- **全局契约看板**：通过全局 `.orch/contracts/registry.json` 动态汇总各并行活跃分支登记的白名单与绝对冻结路径。
- **语义冲突检测**：在 `precheck` 阶段自动执行 `contract-check`，核对"计划修改的白名单是否撞车了他人的冻结表"或"是否同时大改了相同文件"，捕获后执行 P0 级强物理阻断，防止 AI 多分支代码重写踩踏。

### 3. 📡 APM 遥测自愈热闭环 (Telemetry Feedback)
**运行时异常物理反哺回灌机制**：
- **故障诊断发帖**：监控系统通过 Webhook 将运行时 Crash 堆栈反哺至 `telemetry-webhook`。引擎根据 `.orch/templates/hotfix-issue.md` 模板，自动调用 GitHub GraphQL API 自动发帖故障 Issue 并挂载 `hotfix` 与 `observability-breach` 标签。
- **异常物理灌溉**：在拉起 hotfix 分支进行编码前，`precheck` 命令自动捕获 `.orch/contracts/latest-hotfix.json` 异常堆栈，将崩溃函数及报错行特征**物理回灌写入**至 `arch.md` 的 `[契约] 回归护栏`，强制将其列为本次开发的退出判定标准，阻断未修复的带病代码再次上线。

### 4. 🧬 自适应规则自演进编译器 (Guardrail Compiler)
文档不再是死资产，防错经验可自动化编码：
- **防错规则编译**：每次交付后的 `retro` 阶段自动生成可编译的 JSON 候选规则。`guardrail-compile` 读取该文件，自动提取真绿报错词、新增敏感路径与 PreToolUse 正则拦截 Hook。
- **安全红线阻断**：提供 `allowAutoRewrite` 安全开关。只有当 `allowAutoRewrite` 被显式配置为 `true` 且命令行被加上 `--confirm` 时，才会触发物理覆盖写入，将规则合入项目 `.orch/config.json` 与 Hook 正则，闭合演进环，真正做到 100% 权限可控；若关闭，则拦截并输出 Dry-Run 差异供人类一键合并，达成"系统免疫力"自进化。

### 5. 🔑 生产级运行权限与物理安全语义 (Production Operation & Safety Semantics)
`CodingWorkflow` 旨在工业级真实生产团队与 CI/CD 交付中运行，它在提供 100% 闭环能力的同时，恪守严格的物理安全红线与自适应降级机制，保证"AI 工作流的可控与安全"：
- **Post-Merge 真实环境执行与自适应网络边界机制**：
  在 PR 合并后，通过执行 `/orch post-merge <phase_issue>` 触发交付核验：
  - **真实门禁校验**：真实执行本地编译的 `gate` 测试套件真绿校验，如果未通过且开启了发布阻断（`workflowGates.release === 'block'`），物理中断进程，阻止发布。
  - **自适应健康检查 (HTTP Ping)**：向 APM 服务端点发送探测，并内置工业级自适应网络边界判定：如果探测返回 `5xx` 崩溃或超时，引擎判定为"离线/受限环境"并自动降级为本地验证模式，避免误报阻断。

---

## ⚙️ 接入配置 `.orch/config.json` 模板

在需要接入 `CodingWorkflow` 的任何项目根目录下，提供 `.orch/config.json`：

```json
{
  "repo": "owner/repo",
  "baseBranch": "origin/main",
  "worktreeDir": "../repo-worktrees",
  "docsDir": "docs",
  "moduleLabels": ["battle-core", "ui-view"],
  "commitTypes": ["功能", "修复", "重构", "测试", "文档", "杂项", "基建"],
  "whitelistEnforcePaths": ["src/", "lib/", "scripts/"],
  "linkNodeModules": false,
  "retro": {
    "enabled": false
  },
  "largeFileExtensions": ["xml", "csv"],
  "migrationCheck": true,
  "workflowGates": {
    "intake": "block",
    "probing": "warn",
    "adr": "block",
    "debug": "block",
    "contractCollision": "block",
    "chaos": "block",
    "release": "block",
    "guardrailCompile": "warn"
  },
  "commands": {
    "lint": "npm run lint",
    "format": "npm run format",
    "test": "npm run test",
    "build": "npm run build"
  },
  "greenVerdict": {
    "successString": "tests passed successfully",
    "errorKeywords": ["Error", "Exception", "FAILED", "Parse Error", "Unhandled Rejection"]
  },
  "guardrailCompiler": {
    "allowAutoRewrite": true
  },
  "observability": {
    "metricsUrl": "https://apm.company.com/services/metrics",
    "hotfixTemplate": ".orch/templates/hotfix-issue.md"
  },
  "architectureDocs": {
    "enabled": true,
    "dir": "docs/architecture",
    "uncertaintyPolicy": "conservative-update"
  }
}
```

### ⚙️ 核心参数详细说明
- `repo` [必填]：目标仓库路径（"owner/repo_name"）。
- `baseBranch` [必填]：开发基线分支（"origin/main"）。
- `worktreeDir` [可选]：指定独立 linked worktree 创建的相对目录。
- `docsDir` [可选]：指定项目技术文档输出的总目录（默认 `"docs"`）。
- `moduleLabels` [可选]：指定项目可选的子系统/模块分类标签列表。
- `commitTypes` [可选]：限制合规提交的日志类型词，配合 hooks 进行强校验。
- `whitelistEnforcePaths` [可选]：编码前敏感路径前缀，未 precheck 前修改其中路径会被 Hook 强力拦截。
- `linkNodeModules` [可选]：是否自动为新 worktree 软链接 `node_modules`。非 Node 项目建议设为 `false`。
- `retro.enabled` [可选]：是否在交付后（E-2 阶段）开启 Retro 知识沉淀与防错规则提取，默认 `false`（不开启）。
- `largeFileExtensions` [可选]：指定项目自定义的只读大文件后缀，大文件在主会话读取会被拦截并引导分派 subagent。
- `migrationCheck` [可选]：是否对涉及 Schema 契约变更的文件强制校验 up & down 回滚 SQL 脚本的存在性。
- `workflowGates` [可选]：定义从需求 Intake 到混沌 Chaos 各流程模块的门禁等级（`block` 阻断 / `warn` 警告 / `off` 降级关闭）。
- `workflowGates.debug` [可选]：控制 D 阶段 `gate` 失败后的自动 Debug，缺省为 `block`（自动诊断并等待 `/debug confirm`）；设为 `warn` 时只生成诊断评论，设为 `off` 时关闭自动 Debug。
- `commands` [可选]：定义门禁中调用本地编译器的各种指令（含 build/lint/test/format）。
- `architectureDocs` [可选]：控制全局架构文档同步检查；默认目录为 `docs/architecture`，不确定变更默认走 `conservative-update`，只追加短日志供人工复核。

---

## 🛠️ 安装与使用总览

### 前置条件

在接入任何目标项目之前，先确认本机具备：

- Git 仓库：目标项目必须是 Git 仓库，且能创建 linked worktree。
- Node.js：`orch-cli/dist/index.js` 使用 Node 运行；如果修改了 `orch-cli/*.ts`，需要在 `orch-cli/` 下运行 `npm install && npm run build` 重新生成 `dist/`。
- GitHub CLI：涉及 issue、PR、Project 状态流转的命令依赖 `gh` 已登录，并且 `.orch/config.json` 的 `repo` 与远端仓库一致。
- 目标项目配置：在目标项目根目录创建 `.orch/config.json`，最小必填字段是 `repo` 与 `baseBranch`。
- Claude/Codex 权限：涉及写文件、创建分支、push、PR、GitHub issue 评论的步骤都是真实副作用；先用 `--dry-run` 做预演。

### 目标项目最小配置

把本仓库的 `.orch/config.example.json` 复制到目标项目，并至少改掉以下字段：

```bash
mkdir -p .orch
cp /Users/jason/Documents/APP/CodingWorkflow/.orch/config.example.json .orch/config.json
```

必须核对：

| 字段 | 说明 |
|---|---|
| `repo` | GitHub 仓库，格式 `owner/name`，必须与 `git remote -v` 指向一致 |
| `baseBranch` | Phase 分支基线，例如 `origin/main` |
| `worktreeDir` | Phase linked worktree 的父目录，建议放在目标仓库同级目录 |
| `commands` | `gate` 会真实执行的 `lint` / `format` / `test` 命令 |
| `greenVerdict` | 真绿三硬判定：退出码 0、命中成功串、未命中错误关键词 |
| `workflowGates` | 每个门禁的 `block` / `warn` / `off` 策略 |
| `whitelistEnforcePaths` | 未通过 precheck 前禁止写入的核心路径前缀 |

验证配置能被 CLI 读取：

```bash
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js gate --dry-run
```

### 在 Claude Code CLI 中安装和使用

Claude Code 是本仓库当前的原生插件目标环境。仓库已经提供 `.claude-plugin/plugin.json` 与 `.claude-plugin/marketplace.json`，安装后会注册 `/orch`、`/debug`、阶段 agents 与 PreToolUse hooks。

**方式 A：在 Claude Code 交互会话里注册本地 marketplace**

在目标项目根目录打开 Claude Code CLI，然后执行（把示例中的 `/Users/jason/Documents/APP/CodingWorkflow` 换成你本机克隆仓库的绝对路径，例如 Windows 下 `F:\projects\CodingWorkflow`）：

```text
/plugin marketplace add /Users/jason/Documents/APP/CodingWorkflow
/plugin install codingworkflow@codingworkflow-local-marketplace
/reload-plugins
/plugin list
```

期望结果：

- `codingworkflow@codingworkflow-local-marketplace` 处于 enabled 状态。
- `/orch` 与 `/debug` 出现在 slash command 列表。
- agents 列表包含 `triage`、`probing`、`adr`、`arch`、`design`、`coding`、`debug`、`chaos`、`test`、`review`、`release`、`architecture-docs`、`guardrail-compiler`、`retro`。

**方式 B：用 `.claude/settings.local.json` 固定本地安装**

适合个人机器或单个项目，不建议写入团队共享配置。把下面内容合并到目标项目的 `.claude/settings.local.json`：

```json
{
  "extraKnownMarketplaces": {
    "codingworkflow-local-marketplace": {
      "source": {
        "source": "directory",
        "path": "/Users/jason/Documents/APP/CodingWorkflow"
      }
    }
  },
  "enabledPlugins": {
    "codingworkflow@codingworkflow-local-marketplace": true
  }
}
```

> 说明：
> - `path` 改成你本机克隆仓库的绝对路径（Windows 如 `F:\projects\CodingWorkflow`）；相对路径在 settings 里可能不被解析（参见 Claude Code issue #23978），请用绝对路径。
> - `source` 取 `directory`（指向含 `.claude-plugin/marketplace.json` 的目录），是官方文档给出的本地目录写法；settings.local.json 的实际解析建议再用真实 CLI 复核一次。
> - 三处标识符必须完全一致：`marketplace.json` 的 `name`、`extraKnownMarketplaces` 的 key、`enabledPlugins` 引用的 `@` 后缀，全部是 `codingworkflow-local-marketplace`。
> - 若 settings 声明没生效，改用方式 A 的 `/plugin marketplace add` 注册（更可靠）。

重新进入 Claude Code CLI 后执行：

```text
/reload-plugins
/plugin list
```

**启动一个 Phase**

确认目标项目 `.orch/config.json` 已经就绪后，使用 GitHub Phase issue 编号或 URL 启动：

```text
/orch <GitHub Phase Issue 编号或 URL>
```

常用命令：

```text
/orch status
/orch resume
/orch post-merge <phase_issue>
/orch escalate <原因>
/debug <sub_issue>
/debug confirm <sub_issue>
```

安全建议：

- 首次接入先在低风险 issue 上验证，不要直接拿重量级功能当安装验证。
- 需要检查底层命令时，先运行 `--dry-run`。例如在插件命令提示词中调用的 CLI 均可手动预演：
  ```bash
  node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js branch-create --type phase --n 1 --slug demo --issue 123 --dry-run
  ```
- `/orch` 会逐步创建 worktree、分支、文档、issue/PR 状态。不要在未核对配置的情况下直接对生产仓库执行。

### 在 Claude Code IDE 中安装和使用

Claude Code IDE 场景与 CLI 使用同一套项目配置和插件资产，核心差异是入口在 IDE 的 Claude Code 面板，而不是终端 TUI。

推荐做法：

1. 先在目标项目中落好 `.orch/config.json`。
2. 在同一目标项目下创建或合并 `.claude/settings.local.json`，内容与上面的 CLI 方式 B 相同。
3. 重启或刷新 IDE 中的 Claude Code 会话。
4. 在 Claude Code 面板里运行：
   ```text
   /reload-plugins
   /plugin list
   /orch status
   ```
5. 如果 slash command 与 agents 都能被识别，就可以在 IDE 会话里直接运行：
   ```text
   /orch <GitHub Phase Issue 编号或 URL>
   ```

IDE 使用建议：

- 把 IDE 当成主会话入口时，不要同时在另一个 Claude Code CLI 会话里推进同一个 Phase，避免两个主会话抢同一个 `.orch/phases/phase-<issue>.json`。
- 若 IDE 版本暂时没有显示本地插件或 `/orch` 命令，使用 Claude Code CLI 完成编排，IDE 只作为编辑器查看 worktree 和文档。
- 插件 hook 会按 Claude Code 的 PreToolUse 机制拦截写入、提交信息和上下文污染；如果 hook 没有生效，先检查插件是否 enabled，再检查 `.orch/config.json` 是否存在。

### 在 Codex 中安装和使用

当前仓库是 **Claude Code 插件形态**，还不是原生 Codex 插件形态：仓库没有 `.codex-plugin/plugin.json`，`commands/orch.md` 也不会自动变成 Codex 的 `/orch` slash command。因此不要把 Claude 安装命令 `/plugin install codingworkflow` 直接写成 Codex 可用命令。

Codex 里可以按三种层级使用这个 Workflow。

**层级 1：当前可用，作为源码工作流和 CLI 工具使用**

在目标项目中准备 `.orch/config.json` 后，直接调用本仓库的 CLI：

```bash
export CODINGWORKFLOW_ROOT=/Users/jason/Documents/APP/CodingWorkflow
node "$CODINGWORKFLOW_ROOT/orch-cli/dist/index.js" gate --dry-run
node "$CODINGWORKFLOW_ROOT/orch-cli/dist/index.js" branch-create --type phase --n 1 --slug demo --issue 123 --dry-run
```

已有 `.orch/phases/phase-<issue>.json` 和 sub-issue 状态后，再使用状态相关命令：

```bash
node "$CODINGWORKFLOW_ROOT/orch-cli/dist/index.js" state-next
node "$CODINGWORKFLOW_ROOT/orch-cli/dist/index.js" precheck --sub <sub_issue> --dry-run
```

在 Codex 会话中给出明确指令，例如：

```text
请按 /Users/jason/Documents/APP/CodingWorkflow/README.md 的 CodingWorkflow 规则协作。
先读取目标项目 .orch/config.json、docs/triage、docs/adr、arch.md、test.md。
未确认前只运行 --dry-run，不创建分支、不 push、不发 PR。
```

如果希望 Codex 持久遵守本工作流，把关键约束写入目标项目 `AGENTS.md`。Codex 会按项目层级读取 `AGENTS.md`，适合沉淀三表、Decision Needed、测试真实性、禁止读密钥等长期规则。

**层级 2：通过 Codex App 导入现有 agent setup**

Codex App 提供“Import other agent setup”入口，可以导入受支持的 instruction、settings、skills、plugins、hooks、slash commands、subagents 等项目。导入不会删除原 Claude 配置，但导入后必须逐项复核：

- 导入的 hooks 在 Codex 中的事件名、matcher、工具名是否仍等价。
- Claude 的 `/orch` slash command 是否被导入为 Codex 可识别的 skill / prompt / plugin。
- 任何需要授权的插件或连接器是否完成设置。

如果导入结果没有出现可用的 Codex 插件或 slash command，退回层级 1，使用 CLI 与 `AGENTS.md`。

**层级 3：未来原生 Codex 插件化**

要把本仓库做成 Codex 原生插件，需要新增 Codex 插件清单并做映射，不是 README 配置即可完成：

| Claude 当前资产 | Codex 原生化建议 |
|---|---|
| `.claude-plugin/plugin.json` | 新增 `.codex-plugin/plugin.json` |
| `commands/orch.md`、`commands/debug.md` | 改造成 Codex skills 或 Codex 可识别的插件命令入口 |
| `agents/*.md` | 按 Codex skills/subagents 规则拆分和声明 |
| `hooks/hooks.json` | 校对 Codex hook 事件、matcher、工具名后迁移 |
| `CLAUDE_PLUGIN_ROOT` 路径引用 | 改成 Codex 插件运行时可解析的路径或改为显式 `CODINGWORKFLOW_ROOT` |

在完成原生化之前，Codex 的可靠使用方式是：用 `AGENTS.md` 提供协作纪律，用 `orch-cli` 提供确定性门禁，用 Codex 的普通文件编辑/命令执行能力完成具体实现。

### 更新与维护

如果只更新 README、agents、commands 或 hooks，已安装 Claude 插件的项目需要刷新插件（`/plugin marketplace update` 从本地 marketplace 目录重新拉取列表，`/reload-plugins` 不重启即生效）：

```text
/plugin marketplace update codingworkflow-local-marketplace
/reload-plugins
```

> 注：本地目录 marketplace 改动若刷新后仍未生效，重启 Claude Code 是最稳妥的兜底。

如果修改了 `orch-cli/*.ts`：

```bash
cd /Users/jason/Documents/APP/CodingWorkflow/orch-cli
npm install
npm run build
npm test
```

本仓库自带 Git hook，用来避免提交 TypeScript 源码却忘记重建 `dist/`：

```bash
git config core.hooksPath .githooks
```

---

## 🔮 核心八纪律与扩展可选模块对齐

为了恪守 Epic "保持精简" 的设计红线，我们对引擎中多出的超范围模块进行了清晰的可选性界定。您可以通过在配置中设置 `workflowGates` 进行分级降级或通过开关直接关闭，确保引擎的绝对通用性。

**引擎保留全部扩展模块作为能力，均可通过 `workflowGates.*`（block/warn/off）或独立开关（如 `retro.enabled`）降级或关闭，对未接入项目优雅 no-op，因此不违背「保持精简」的通用性红线。**

| 模块分类 | 所属流程阶段 | 质量纪律控制类型 | 强制/可选 | 如何关闭/降级 |
|---|---|---|---|---|
| **白名单拦截 Hook** | 编码阶段 (C) | 纪律 1：白名单拦截 (HARD RULE) | **强制 (Mandatory)** | 项目白名单为空时自动 fail-open；非接入项目透明放行 |
| **七启动与九停止摘要** | 编码阶段 (C) | 纪律 2/3：启动与停止约束 | **强制 (Mandatory)** | 写入 Coding Agent 核心系统提示词，不可关闭 |
| **架构契约三表** | 设计阶段 (B) | 纪律 4：契约锁定 (三表齐全 + 护栏非空) | **强制 (Mandatory)** | precheck 强门禁，如缺失则强力拦截编码进程 |
| **真绿与伪绿三硬 gate** | 验收阶段 (D) | 纪律 5：测试真绿判定 (AND 判定) | **强制 (Mandatory)** | 可通过空 commands 默认放行；支持 `--dry-run` 调试 |
| **Debug 诊断闭环** | 验收阶段 (D) | 纪律 5 扩展：失败证据定位与人工确认修复 | **可选 (Optional)** | 配置 `workflowGates.debug: "off"` 关闭自动 Debug，手动 `/debug` 仍可用 |
| **编码前 precheck 门禁** | 编码前 (C 前) | 纪律 6：编码前 Graded 门禁强阻断 | **强制 (Mandatory)** | 不可关闭，提供 high-level 安全屏障 |
| **设计验收与代码审计** | 验收阶段 (D) | 纪律 7：量测指标核对与 PII 脱敏审计 | **强制 (Mandatory)** | 可通过无 `needs-ui` 标签跳过设计清单，PII 强制审计 |
| **Retro 知识沉淀与免疫** | 交付后阶段 (E-2) | 纪律 8：Retro 复盘与规则自愈编译器 | **可选 (Optional)** | 默认关闭。配置 `retro.enabled` 为 `true` 启用 |
| **需求准入 (Triage)** | 阶段 0 | 流程扩展 (需求 Intake 裁决) | **可选 (Optional)** | 配置 `workflowGates.intake: "off"` 关闭 |
| **现状勘探 (Probing)** | 阶段 A1 | 流程扩展 (现状只读防撞车扫描) | **可选 (Optional)** | 配置 `workflowGates.probing: "off"` 关闭 |
| **并发语义锁 (Collision)** | 设计阶段 (B) | 流程扩展 (跨分支语义踩踏防御) | **可选 (Optional)** | 配置 `workflowGates.contractCollision: "off"` 关闭 |
| **混沌对抗防御 (Chaos)** | 验收阶段 (D) | 流程扩展 (负向安全红蓝混沌攻击) | **可选 (Optional)** | 配置 `workflowGates.chaos: "off"` 关闭 |
| **发布回滚 Runbook (Release)** | 发布阶段 (E) | 流程扩展 (灰度开关与一键回滚审计) | **可选 (Optional)** | 配置 `workflowGates.release: "off"` 关闭 |
| **遥测闭环 (Telemetry)** | Hotfix/APM 闭环 | 自愈扩展 (APM 异常热回灌) | **可选 (Optional)** | 默认只读检测。非 Hotfix 场景或无 anomalous json 时自动放行 |

---

## ⚖️ 注入的十项硬核质量纪律 (HARD RULE)

1. **白名单拦截 Hook**：由 `pre-tool-use` 强力挂载，编码中越出白名单文件（以 `arch.md` 强制三表为准）的任何 Edit/Write 操作，由 Hook 直接返回 `exit 2` 截断，从层面消除越界篡改。
2. **七项启动摘要要求**：Coding Agent 修改前，必须率先向主进程上报目标、AC、冻结表、白名单与回归护栏，格式不符严禁开工。
3. **九类停止升级条件**：当默认值冲突、日志级别含混、方案两难或白名单存疑时，Agent 必须以 `🚨 NEEDS_USER_INPUT` 强行暂停上报，杜绝胡乱编码。
4. **并发契约锁比对**：在 precheck 中通过全局 registry 查重。任何人动用了被他人占用的白名单或声明冻结的模块，门禁直接 P0 阻断。
5. **方案 ADR 双选门禁**：无 Trade-offs 方案比对表或无未来反悔指标，门禁直接 P0 拦截。
6. **"真绿"判定断言**：运行测试时由 `gate` 命令行校验，必须满足：`exitCode === 0` ∧ `命中成功关键词` ∧ `未命中致命报错词`，三硬全绿才放行。
7. **可观测性 PII 日志脱敏**：强制在 D 阶段进行代码 AST 审查，严禁在日志中记录任何明文 Token、密码 and 个人电话等，未遮蔽当场退单。
8. **红蓝混沌负向防御门禁**：在 D 阶段强制派发 Chaos Agent，针对高并发竞态、数据库断连、外部接口超时等注入破坏。若缺 Fallback，`chaos-gate` 门禁强阻断。
9. **Schema 迁移双向防护**：只要涉及数据 Schema 修改，必须成对在 `db/migrations/` 提供 up & down 脚本，保证生产故障可一键回滚自愈。
10. **运行时 Telemetry 闭环反哺**：生产监控异常通过 webhook 回流发帖并支持 `telemetry-backfill --confirm` 灌入 `arch.md` 回归护栏，完成"警报 ➔ 降回 worktree ➔ 强制回归护栏 ➔ 免疫测试真绿上线"的完全自愈闭环。

---

## 📂 引擎布局与插件目录

```
CodingWorkflow/
├── .claude-plugin/
│   ├── plugin.json               # 插件元数据（命令/agents 由目录自动发现）
│   └── marketplace.json          # Marketplace 本地注册信息
├── commands/
│   ├── orch.md                   # /orch 主编排状态机骨架 (声明了全套 HARD RULE)
│   └── debug.md                  # /debug 诊断与确认入口
├── agents/
│   ├── triage.md                 # 需求准入 Triage Agent (产出 intake-<Issue>.md)
│   ├── probing.md                # 现状勘探 Probing Agent (只读分析防撞车)
│   ├── adr.md                    # 架构决策 ADR Agent (记录取舍与失效反悔指标)
│   ├── arch.md                   # 架构锁定 Arch Agent (产出契约三表与可观测性打桩契约)
│   ├── design.md                 # UI设计 Design Agent (产出 Headless 及目视量测清单)
│   ├── coding.md                 # 编码 Coding Agent (含七启动与九停止受控指令)
│   ├── debug.md                  # 诊断 Debug Agent (临时日志、无头复现、证据评论、修复计划)
│   ├── chaos.md                  # 混沌 Chaos Agent (红蓝对抗负向安全审计，禁止写码)
│   ├── test.md                   # 测试 Test Agent (测试设计与执行报告)
│   ├── review.md                 # 代码审查 Review Agent (契约校验、日志脱敏与 PII 脱敏审查)
│   ├── release.md                # 发布规划 Release Agent (产出回退 Runbook 与 Schema 补偿)
│   ├── architecture-docs.md       # 全局架构文档维护 Agent (只更新 docs/architecture)
│   ├── retro.md                  # 复盘 Retro Agent (知识沉淀与防错规则候选提取)
│   └── guardrail-compiler.md     # 规则编译器 Agent (解析 retro 生成候选配置防御 diff)
├── hooks/
│   ├── hooks.json                # 拦截 Hook 全局配置 (pre-tool-use)
│   ├── guard-impl-access.sh      # 确定性白名单越界拦截 Hook
│   ├── validate-commit-msg.sh    # 中文语义规范 Commit 日志强拦截 Hook
│   └── guard-context-pollution.sh# 上下文防污染 Hook (严禁大范围遍历污染会话)
├── docs/
│   └── ops/
│       └── observability.md      # 📡 通用厂商无关可观测性与 PII 日志脱敏规范
└── orch-cli/
    └── dist/index.js             # 🚀 打包后的 TypeScript CLI 统一驱动引擎
```

---

*自演进 AI 工程纪律引擎 CodingWorkflow，让 AI 协作如钟表般精确、如大坝般坚固。*
