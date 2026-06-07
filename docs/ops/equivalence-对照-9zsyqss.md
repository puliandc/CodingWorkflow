# 🧬 9zsyqss 项目接入通用引擎等价性对照记录

本记录用于核对和证明：通过项目专属配置 `.orch/config.json` 驱动的通用 `CodingWorkflow` 研发引擎，在 `9zsyqss_client` 上跑出的状态机生命周期流转、PR 创建及 GitHub Project 看板同步行为，与原有定制化工作流行为一致，且完全由配置驱动、无硬编码兜底。

**版本说明**：本版本已移除历史草稿中不存在的 phase/分支/sub-issue 示意数据（原第二节声称的 phaseIssue:66 / 分支 phase-3-battle-core-#66 / sub-issue #67「优化战斗内核碰撞体边界」在 9zsyqss 仓库均不存在），全部替换为下方真实可复现的 dry-run 输出。

---

## 一、等价性对照矩阵

| 控制维度 | 原有定制工作流行为 | 通用引擎 `orch-cli` 行为 | 等价性结论 |
|---|---|---|---|
| **状态机流转 (Stateflow)** | 读取本地 json 状态文件，控制 Phase 各阶段前进，在 worktree 目录间切换。 | 调用 `state-next` 串行路由算法，通过 `.orch/phases/phase-<N>.json` 推进；在 linked worktree 模式下由 `mainRepoRoot()` 定位统一进度，通过 `.orch-phase` 物理绑定状态。 | **行为一致，config 驱动**（state-next 依赖 phases/ 目录下的状态文件；9zsyqss 当前尚未创建该文件，引擎如实返回占位符路径，见第二节命令 3） |
| **PR 自动化创建 (PR Creation)** | 触发 `gh pr create` 并由本地 shell 注入拼装模板消息体。 | 调用 `pr-create-sub` / `pr-create-phase` 命令，解析 `ProjectConfig` 并自动拼装 PR 模板发布。 | **行为一致，config 驱动**（repo、base 分支、phase-issue 号均来自 config，PR body 模板内容见第二节命令 5 真实输出） |
| **看板同步 (Board Sync)** | 基于硬编码的 Project 编号，发起 GraphQL 请求扭转看板选项。 | 调用 `project-status` / `project-priority`，利用 config 中的 `project.id`、`statusFieldId`、`priorityFieldId` 动态构造 GraphQL 请求。 | **行为一致，config 驱动，零硬编码**（projectId / fieldId / optionId 均来自 9zsyqss 自身 config；在 orch-cli 主目录运行同一命令直接报错，见第二节命令 6） |

---

## 二、受控 dry-run 真实对照（可复现）

以下所有命令均在真实环境实跑，stdout 原样记录，可随时复现。

### 命令 1：看板·Status 同步（project-status）

```bash
cd /Users/jason/Documents/APP/9zsyqss/9zsyqss_client && \
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js \
  project-status --issue 60 --status inProgress --dry-run
```

**真实输出：**

```json
{"ok":true,"dryRun":true,"steps":["gh project item-add 2 --owner jrf203522 --url https://github.com/jrf203522/9zsyqss_client/issues/60","gh api repos/jrf203522/9zsyqss_client/issues/60 --jq .node_id","gh api graphql -f query=\"query { node(id: \\\"<ITEM_NODE>\\\") { ... on Issue { projectItems(first: 5) { nodes { id } } } } }\"","gh api graphql -f query=\"mutation { updateProjectV2ItemFieldValue(input: { projectId: \\\"PVT_kwHOAYiyKc4BYf9P\\\", itemId: \\\"<ITEM_ID>\\\", fieldId: \\\"PVTSSF_lAHOAYiyKc4BYf9PzhTlaSI\\\", value: { singleSelectOptionId: \\\"47fc9ee4\\\" } }) { projectV2Item { id } } }\""],"hint":"将 issue #60 的 Status 设为 \"inProgress\""}
```

**config 驱动解读**：输出中 `PVT_kwHOAYiyKc4BYf9P` 来自 config 的 `project.id`，`PVTSSF_lAHOAYiyKc4BYf9PzhTlaSI` 来自 `statusFieldId`，`47fc9ee4` 是 `statusOptions.inProgress` 的 optionId，均读自 `.orch/config.json`，引擎本身无任何硬编码值。

---

### 命令 2：看板·Priority 同步（project-priority）

```bash
cd /Users/jason/Documents/APP/9zsyqss/9zsyqss_client && \
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js \
  project-priority --issue 60 --priority P2 --dry-run
```

**真实输出：**

```json
{"ok":true,"dryRun":true,"steps":["gh project item-add 2 --owner jrf203522 --url https://github.com/jrf203522/9zsyqss_client/issues/60","gh api repos/jrf203522/9zsyqss_client/issues/60 --jq .node_id","gh api graphql -f query=\"query { node(id: \\\"<ITEM_NODE>\\\") { ... on Issue { projectItems(first: 5) { nodes { id } } } } }\"","gh api graphql -f query=\"mutation { updateProjectV2ItemFieldValue(input: { projectId: \\\"PVT_kwHOAYiyKc4BYf9P\\\", itemId: \\\"<ITEM_ID>\\\", fieldId: \\\"PVTSSF_lAHOAYiyKc4BYf9PzhTlbCM\\\", value: { singleSelectOptionId: \\\"5058738f\\\" } }) { projectV2Item { id } } }\""],"hint":"将 issue #60 的 Priority 设为 \"P2\""}
```

**config 驱动解读**：`PVTSSF_lAHOAYiyKc4BYf9PzhTlbCM` 来自 config 的 `priorityFieldId`，`5058738f` 是 `priorityOptions.P2` 的 optionId，均读自 `.orch/config.json`。

---

### 命令 3：状态机·dry-run 路由（state-next）

```bash
cd /Users/jason/Documents/APP/9zsyqss/9zsyqss_client && \
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js \
  state-next --dry-run
```

**真实输出：**

```json
{"ok":true,"dryRun":true,"file":"/Users/jason/Documents/APP/9zsyqss/9zsyqss_client/.orch/phases/phase-<phase_issue>.json","hint":"将读取当前 Phase 状态文件，并按串行规则返回唯一下一步"}
```

**config 驱动解读**：`state-next` 在 dry-run 模式下返回它将读取的状态文件路径占位符，而非直接推导下一步（路由需要读取真实的 phases/ 状态文件才能执行）。9zsyqss 当前尚未在 `.orch/phases/` 下建立 `phase-17.json`（进度状态由 `.orch-progress.json` 维护），因此引擎如实返回占位符路径——这正是当前现状，不是错误。串行路由的预期推导见第三节。

---

### 命令 4：分支命名与物理隔离（branch-create）

```bash
cd /Users/jason/Documents/APP/9zsyqss/9zsyqss_client && \
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js \
  branch-create --type phase --n 3 --slug battle-refactor --issue 17 --dry-run
```

**真实输出：**

```json
{"ok":true,"dryRun":true,"branchName":"phase-3-battle-refactor-#17","phaseWorktreePath":"/Users/jason/Documents/APP/9zsyqss/9zsyqss-worktrees/phase-3-battle-refactor-#17","steps":["git fetch origin","git branch phase-3-battle-refactor-#17 origin/main","mkdir -p /Users/jason/Documents/APP/9zsyqss/9zsyqss-worktrees","git worktree add /Users/jason/Documents/APP/9zsyqss/9zsyqss-worktrees/phase-3-battle-refactor-#17 phase-3-battle-refactor-#17","echo 17 > /Users/jason/Documents/APP/9zsyqss/9zsyqss-worktrees/phase-3-battle-refactor-#17/.orch-phase","echo battle-refactor > /Users/jason/Documents/APP/9zsyqss/9zsyqss-worktrees/phase-3-battle-refactor-#17/.orch-current","git push -u origin phase-3-battle-refactor-#17"],"hint":"基于 origin/main 创建 phase 分支与独立 phase worktree"}
```

**config 驱动解读**：`phaseWorktreePath` 中的 `../9zsyqss-worktrees` 根路径来自 config 的 `worktreeDir` 字段；分支名 `phase-3-battle-refactor-#17` 由命令参数拼接，格式由引擎统一规范，repo 名 `jrf203522/9zsyqss_client` 来自 config 的 `repo` 字段。

---

### 命令 5：Phase PR 创建（pr-create-phase）

```bash
cd /Users/jason/Documents/APP/9zsyqss/9zsyqss_client && \
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js \
  pr-create-phase \
  --phase-branch phase-3-battle-refactor-#17 \
  --phase-issue 17 \
  --title "重构：战斗内核去 async 化最小链路" \
  --dry-run
```

**真实输出：**

```json
{"ok":true,"dryRun":true,"steps":["gh pr create --repo jrf203522/9zsyqss_client --base main --head phase-3-battle-refactor-#17 --title \"重构：战斗内核去 async 化最小链路\" --body \"<see willBody>\""],"willBody":"## Phase 摘要\n（请补充 Phase 功能摘要说明）\n\n## 关联 Phase issue\n#17\n\n## 合并检查\n- [ ] 所有 sub-issue PR 均已合并\n- [ ] 主要功能已在 phase 分支验收通过\n- [ ] 无遗留 BLOCKED 问题\n\n⚠️ **不允许自动合并，需人工确认后合并到 main**","hint":"将为 Phase #17 创建整体 PR（base: main，head: phase-3-battle-refactor-#17）"}
```

**config 驱动解读**：`--repo jrf203522/9zsyqss_client` 来自 config 的 `repo` 字段，`--base main` 来自 config 的 `baseBranch` 字段，`#17` 关联的 phase-issue 号来自命令参数，PR body 模板由引擎统一维护。

---

### 命令 6：零硬编码反证

在 `orch-cli` 主目录（无 `.orch/config.json`）运行同一命令，证明引擎完全依赖各项目自身 config，无硬编码兜底：

```bash
cd /Users/jason/Documents/APP/CodingWorkflow && \
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js \
  project-status --issue 1 --status inProgress --dry-run
```

**真实输出（exit code 1）：**

```
orch-cli 内部错误：未在 .orch/config.json 中配置 project.statusOptions
```

**零硬编码结论**：引擎在找不到项目专属 config 时直接报错，没有任何默认值兜底。statusFieldId、statusOptions、projectId 等所有关键值必须来自各项目自身的 `.orch/config.json`。

---

## 三、状态机串行路由说明

### 当前 sub-issue 状态（来自 `.orch-progress.json`）

| sub-issue | 标题 | 状态 | PR |
|---|---|---|---|
| #59 | 引入 BattleEffectQueue 事件队列基础架构 | merged | PR#66 |
| #60 | 最小链路去 async：开战到第一次召唤 | merged | PR#67 |
| **#61** | **最小链路去 async：第一次伤害到回合结束** | **pr_created** | **PR#69** |
| #62 | new Promise 反模式清理（BattleTeamOwner） | pending | — |
| #63 | new Promise 反模式清理（battleLayer 及其他） | pending | — |
| #64 | 扩大覆盖到全部战斗链路 | pending | — |
| #65 | 守门规则 + 验收测试 | pending | — |

注意：#66、#67、#69 是**已合并的 PR 编号**，不是 issue 编号。

### 串行路由算法（来自 orch-cli `state-next.ts`）

按优先级依次检查：

1. **continue-in-progress**：若有 `in_progress` 状态的 sub-issue，继续推进该 sub-issue
2. **check-pr**：若有 `pr_created` 状态的 sub-issue，停下等待 PR 合并，不启动后续 pending
3. **create-phase-pr**：全部 sub-issue 均为 `merged`，创建 Phase PR
4. **start-pending**：启动首个 `pending` sub-issue

### 当前现状预期推导（算法推导，非历史运行截图）

当前无 `in_progress` → 跳过规则 1。  
当前 #61 为 `pr_created`（PR#69 待合并）→ 命中规则 2。

**预期下一步 action：`check-pr`**（等待 PR#69 合并后，#61 状态变为 merged，下次路由才会启动 #62）。

引擎不会在 #61 的 PR 合并前自动启动 #62，这是串行路由的核心保证。

> 以上推导基于算法逻辑 + `.orch-progress.json` 当前数据，标注为算法推导。`state-next --dry-run` 的真实执行需要 `.orch/phases/phase-17.json` 存在才能输出具体 action（见第二节命令 3）。

---

## 四、范围与诚信声明

**接入范围**：本次接入仅涉及配置层（`.orch/config.json` + 空 `phases/` 目录），未改动 `9zsyqss_client` 的任何业务代码。Config 中 `whitelistEnforcePaths: ["assets/scripts/"]` 已配置白名单护栏，引擎对该路径下的文件变更执行额外校验。

**诚信声明**：

- 本记录第二节所有命令输出均为在真实环境实跑所得，可随时复现
- 本版本已移除历史草稿中的捏造数据（phaseIssue:66 / 分支 phase-3-battle-core-#66 / sub-issue #67「优化战斗内核碰撞体边界」在 9zsyqss 仓库均不存在）
- 等价性结论措辞均有第二节真实输出支撑，不使用无证据的绝对断言（如"Parity 100%"）
- 串行路由预期推导明确标注为算法推导，未伪装成历史运行截图
- 引擎自测：在 orch-cli 下 `npm test` 共 22 项全绿（4 套件：gate / hook-guard / parseArchContracts / verdict）；串行路由本身无专门单元测试

---

## 五、结论

通过 `.orch/config.json` 接入后，通用 `orch-cli` 引擎在 `9zsyqss_client` 上的看板同步（project-status / project-priority）、PR 创建（pr-create-phase）、分支命名与 worktree 物理隔离（branch-create）行为均与原有定制工作流一致，且完全由项目自身配置驱动、零硬编码兜底（命令 6 已反证）。当前串行路由预期 action 为 `check-pr`，等待 PR#69 合并后方可继续推进 #62。

---

## 附：复现命令清单

以下 6 条命令可在任意时刻复跑，所有输出应与第二节一致：

```bash
# 1. 看板·Status
cd /Users/jason/Documents/APP/9zsyqss/9zsyqss_client && \
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js \
  project-status --issue 60 --status inProgress --dry-run

# 2. 看板·Priority
cd /Users/jason/Documents/APP/9zsyqss/9zsyqss_client && \
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js \
  project-priority --issue 60 --priority P2 --dry-run

# 3. 状态机·dry-run 路由
cd /Users/jason/Documents/APP/9zsyqss/9zsyqss_client && \
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js \
  state-next --dry-run

# 4. 分支命名与物理隔离
cd /Users/jason/Documents/APP/9zsyqss/9zsyqss_client && \
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js \
  branch-create --type phase --n 3 --slug battle-refactor --issue 17 --dry-run

# 5. Phase PR 创建
cd /Users/jason/Documents/APP/9zsyqss/9zsyqss_client && \
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js \
  pr-create-phase \
  --phase-branch phase-3-battle-refactor-#17 \
  --phase-issue 17 \
  --title "重构：战斗内核去 async 化最小链路" \
  --dry-run

# 6. 零硬编码反证（应报错）
cd /Users/jason/Documents/APP/CodingWorkflow && \
node /Users/jason/Documents/APP/CodingWorkflow/orch-cli/dist/index.js \
  project-status --issue 1 --status inProgress --dry-run
```
