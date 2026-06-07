# 🎮 P1914 接入执行 Runbook + 能力缺口报告（issue #23）

> 本文档是 issue #23「[修复 #11] P1914 接入执行 + 七阶段旧 skill 退役」的权威执行方案。
> 目的：把接入推进到「可安全、可验证地一键接力」的状态，并显式标注**必须人在回路交互会话**完成的步骤与**退役前必须先补的能力缺口**，避免盲目退役造成生产事故。

## 〇、诚信边界声明（重要）

本 Runbook 由一个在 `CodingWorkflow` 仓库运行的批量会话产出。以下 AC **无法在该会话内真实完成**，因此本会话**未对 P1914 做任何文件改动**，全部经本 Runbook 交付给 P1914 的交互式 Claude Code 会话接力：

- **AC1「跑通一个真实 issue」/ AC2「三机制在 Godot headless 有效」**：orch 工作流（`/orch <issue>`）需要 Claude **交互会话逐阶段驱动**（派 agent、跑 Godot headless 测试、迭代修复、建 PR），且唯一 open issue #6 是真实功能开发，端到端跑通会产生**不可逆**的业务代码与 PR。这无法由非交互批量会话「代跑」，更不能伪造运行记录。
- **AC3「退役无能力缺口」**：见第四节，存在 **GAP-5 高风险缺口**，退役前必须先补。

> 教训承接：本仓库 #22 曾出现「伪造 dry-run 验证数据」并已修正（commit `d7b3e9d`）。本 Runbook 坚持同一红线 —— **凡未真实验证的，绝不声称完成**。

---

## 一、现状与 Blocker

| 项 | 现状 | 处置 |
|---|---|---|
| plugin 安装 | P1914 `settings.json` 无 `enabledPlugins`，plugin 未装 | 见第二节 |
| `.orch/config.json` | 已存在，Godot 字段正确（`commands.test` headless、`greenVerdict.successString`、`whitelistEnforcePaths`） | 保留 |
| **Blocker：repo 字段错误** | `config.repo = "puliandc/P1914"`，但本地 origin 实际是 **`puliandc/P1914MapView`** | **接入前必须修**，否则 orch 的 `pr-create-*` / `project-status` 全部指向不存在的仓库 |
| 旧七阶段 skills | `kickoff/prd/design-check/arch/test-plan/precheck/gate/ship` 仍在 | 退役（依赖第四节缺口补全 + AC1 验证） |
| p1914-* agents | `p1914-coding/gate/godot-verify/reviewer/stage-docs` 仍在 | 退役（同上） |
| 项目专属 skills | `build-macos` / `github-ops` | **保留本地**（plugin 未覆盖，确认见第四节） |
| hooks | `settings.json` 内 6 条手写 PreToolUse | 迁移（见第三节，**非简单删除**） |
| Godot | `/opt/homebrew/bin/godot` = 4.6.2 stable，可用 | ✓ |
| open issue | 仅 #6「[V1.5][功能] 导出与校验 — 14 条规则校验与生成 P1914 JSON」（优先级低优） | AC1 验证载体待定，见第五节 |

### Blocker 修复（第一步，在 P1914 执行）
将 `/Users/jason/Documents/APP/P1914/.orch/config.json` 的
```json
"repo": "puliandc/P1914",
```
改为
```json
"repo": "puliandc/P1914MapView",
```
> 注：`.orch/` 当前未被 git 跟踪，改动仅本地生效、完全可逆。若计划未来把仓库重命名为 `P1914`，则改 remote 而非 config —— 二者必须一致。

---

## 二、Plugin 安装（AC1 前置，可逆）

依据 Claude Code 官方 plugin/marketplace 文档。本地 marketplace 路径只对本机有效，建议放 **`settings.local.json`**（个人、不入 git），避免污染团队共享的 `settings.json`。

在 `/Users/jason/Documents/APP/P1914/.claude/settings.local.json` **合并**以下字段（不要覆盖既有内容）：
```json
{
  "extraKnownMarketplaces": {
    "codingworkflow-local": {
      "source": { "source": "local", "path": "/Users/jason/Documents/APP/CodingWorkflow" }
    }
  },
  "enabledPlugins": {
    "codingworkflow@codingworkflow-local": true
  }
}
```

验证（**必须在 P1914 的交互式 Claude Code 会话执行**）：
```
/reload-plugins
/plugin list          # 应见 codingworkflow@codingworkflow-local (enabled)
/orch                 # 命令应可用；agents 列表应含 triage/probing/adr/arch/design/coding/chaos/test/review/release/guardrail-compiler/retro
```

---

## 三、Hook 迁移（AC4）— 非简单删除，注意语义差异

P1914 `settings.json` 现有 6 条 PreToolUse hook，与 plugin `hooks/hooks.json`（3 条 guard）**并非一一对应**：

| P1914 现有 hook | matcher | plugin hooks.json 对应 | 处置 |
|---|---|---|---|
| `validate-commit-msg.sh` | Bash | ✅ 有（matcher `Bash\|run_command`） | 可迁移（删 P1914 版，依赖 plugin） |
| `guard-impl-access.sh` | **Read** + Bash | ⚠️ 有，但 matcher 为 **`Write\|Edit\|MultiEdit\|...`** | **语义不同**：P1914 拦「读」实现文件，plugin 拦「写」。需先确认 plugin 版白名单逻辑是否覆盖 P1914 意图，否则不可直接删 |
| `guard-context-pollution.sh` | Bash + **Read** | ✅ 有（matcher `Read\|view_file\|Bash\|run_command`） | 大体对应，逐脚本比对后可迁移 |
| **`pre-push.sh`** | Bash | ❌ **plugin hooks.json 无此 hook** | **必须保留在 P1914 本地**，否则丢失 pre-push 校验 |

迁移原则：
1. **保留** `pre-push.sh` 的 hook 注册（plugin 不提供）。
2. `validate-commit-msg` / `guard-context-pollution`：确认 plugin 版脚本逻辑等价后，从 `settings.json` 删除对应条目，由 plugin hooks.json 接管。
3. `guard-impl-access`：**先解决 matcher 语义差异**（Read vs Write）再决定迁移，否则会静默改变白名单防护覆盖面。
4. 迁移后 `/reload-plugins`，并实测：写越界文件应被拦、正常路径放行。

---

## 四、退役能力缺口报告（AC3）—— 退役前必须先补

对照「P1914 旧七阶段 skill + p1914-* agent」 vs 「CodingWorkflow plugin（orch + 12 agents + orch-cli）」，**退役并非零缺口**：

| GAP | 缺口 | 优先级 | 退役前处置 |
|---|---|---|---|
| **GAP-5** | `p1914-reviewer` 的 P1914 四大不变量（MapDocument 唯一真相/分层边界/`E_*` 错误码）+ GDScript 陷阱（跨脚本 `:=`、`.new()` 伪绿、big-endian 坐标）审查规则，通用 `review` agent **完全没有** | **高** | **必须先补**：把这些规则下沉到 `.orch/config.json` 的 guardrail 正则 / retro 防错规则，或保留 P1914 专属 review 补充 prompt，再退役 `p1914-reviewer` |
| GAP-3 | `p1914-gate` 的 gdlint **worktree 基线对比**（过滤历史债务）通用 `gate.js` 无 | 中 | 先确认 `gdlint scripts/` 当前零新增问题，或在 `config.commands.lint` 改为差异对比命令 |
| GAP-1 | `/kickoff` 的 Issue/Milestone 创建（含中文模块 label、Sub-issue 绑定）无等价 | 低-中 | 用保留的 `github-ops` skill 手动补 |
| GAP-2 | PRD.md 生成环节无等价（B 侧以 ADR+arch 替代） | 中 | 确认接受「ADR+arch 替代 PRD」 |
| GAP-6 | `/ship` 的 Tag/Release 创建、CHANGELOG 更新无等价 | 低-中 | 手动或 `github-ops` 补 |
| GAP-4 | SVG 导入测试步骤（`V1.1.0.SvgImportTests.gd`）无独立执行 | 低 | 合并进 RegressionTests 或加测试命令 |
| GAP-7 | Godot 资源预热（新增二进制资源后 `--editor --quit`）无 | 低 | 仅新增资源时影响 |

**保留项确认**：`build-macos`（Godot→macOS .app 导出）、`github-ops`（批量 label/milestone/epic 脚本）均为项目专属、plugin 未覆盖 → **保留本地**。

> 结论：**退役顺序** = 先补 GAP-5（必须）→ 处理 GAP-3 → 跑通 AC1 验证三机制无缺口 → 再删旧 skill/agent。直接删除会丢失 P1914 专属代码审查防线。

---

## 五、AC1 / AC2 验证 Runbook（在 P1914 交互会话执行）

**验证目标**（非交付 issue #6 全功能，而是证明三机制在 Godot 场景生效）：
1. **三表 hook 拦截越界**：在受控 sub 分支白名单外尝试写文件 → 应被 `guard-impl-access` 物理拦截。
2. **真绿判定识破伪绿**：故意制造一次 Godot 测试失败（如引入 `SCRIPT ERROR`）→ `gate` 应判 FAIL，不放行。
3. **七项启动摘要**：`coding` agent 启动时应输出七项启动摘要（任务/白名单/契约/停止条件等）。

**两种验证载体（二选一，需用户决定）**：
- **(A) 最小验证 issue（推荐）**：在 P1914 新建一个小范围真实 issue（如「为 RegressionTests 增补一条断言」），用 `/orch` 跑通 Phase 0→E-2，代价小、可控。
- **(B) 真实开发 issue #6**：完整实现「14 条规则校验 + JSON 生成」。代价大、多轮 Godot 迭代、产生重量级 PR——本质是独立功能开发项目，不建议作为「接入验证」的载体。

跑通后应留下 `.orch-progress.json` 记录（AC1）。

---

## 六、AC 完成状态与接力清单

- [ ] **Blocker** 修 `config.repo` → `puliandc/P1914MapView`（第一节）
- [ ] **AC1** 装 plugin（第二节）+ 选定验证载体跑通真实 issue（第五节，需交互会话）
- [ ] **AC2** Godot headless 下验证三机制（第五节，依赖 AC1）
- [ ] **AC3** 先补 GAP-5（必须）/GAP-3 → 验证无缺口 → 退役旧 skill 与 p1914-* agent（保留 build-macos/github-ops）
- [ ] **AC4** 迁移 hook（第三节，保留 pre-push，处理 guard-impl-access 语义差异）

> #23 保持 open，直至上述在 P1914 交互会话真实验证通过。本 Runbook 提供完整、可复核的接力路径，杜绝「未验证即声称完成」。
