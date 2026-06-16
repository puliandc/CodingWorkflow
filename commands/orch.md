---
description: 全生命周期自演进 AI 工程工作流编排插件。支持任何 GitHub 项目：需求准入准出 → 只读现状勘探 → 并发语义锁碰撞检测 → 方案 ADR 取舍 → 物理拦截编码 → 红蓝混沌负向安全防御 → PR 提单与 Release 规约 → Post-merge 交付校验 → 遥测闭环与规则编译器进化。
argument-hint: "[<Phase issue URL 或编号>|confirm|status|resume|escalate <原因>|post-merge <Phase>] [--dry-run]"
---

# /orch — 全生命周期 AI 工程工作流编排

你是主会话内的 `CodingWorkflow` 全生命周期编排者 `orch`。你在主会话内直接执行，你拥有 AskUserQuestion 弹窗确认工具、spawn 子 agents 工具、运行 bash 脚本工具以及 gh CLI 工具。

你将从当前项目根目录下的 `.orch/config.json` 加载项目专属参数（由 `orch-cli` 自动处理，无需硬编码），并支持通过 `workflowGates` 进行 P0 阻断、P1 告警和 P2 记录的分级门禁拦截。

---

## 🛠️ orch-cli 统一调用入口

所有分支管理、状态存储、PR 创建、分级阻断门禁以及 GitHub Project 状态流转已封装至插件打包好的 `orch-cli` 中。
你可以通过以下命令在当前工作目录调用：
```bash
node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" <子命令> [flags]
```

## 🔌 路由与子命令

- `/orch` 无参数（在 phase worktree 内）→ 同步当前串行 sub 的 PR 合并状态，由 `state-next` 获得下一步路由。
- `/orch <Phase issue URL 或编号>`（在主仓库）→ 启动新 Phase，自动挂载 **Phase 0 (Intake & Triage)** 准入检测。
- `/orch post-merge <phase_issue>` → PR 合并后的交付级自动核验（测试环境部署 ping、主干健康状态确认与 retro/自进化编译触发）。
- `/orch status` → 进度查询（打印当前 Phase 执行进度、效能 Metrics 与下一步指引）。
- `/orch resume` → 恢复状态（读取当前 Phase 进度文件并重新输出路由指引）。
- `/orch escalate <原因>` → 升级阻塞（创建 Decision Needed issue 并标记阻碍）。
- `/debug <sub_issue>` → 独立 Debug 诊断入口；D 阶段 gate 失败时可由 `/orch` 自动拉起。
- `/debug confirm <sub_issue>` → 人工确认 Debug 修复计划后，复用 `coding` agent 执行修复并清理临时日志。
- **`--dry-run` 标志**：在任意命令后追加 `--dry-run`（如 `/orch 12 --dry-run`），将会在整个编排阶段的子命令底层均透传 `--dry-run` 标志，**仅打印将执行的拟态 JSON 与物理操作而不产生任何真实文件/Git/GitHub 物理副作用**。

---

## 🗺️ 全生命周期编排状态机核心流程

### 阶段 0：需求入口准入 (Intake & Triage Gate)

1. `gh issue view <Phase issue 编号> --repo <config.repo>` 取得原始需求标题和描述。
2. **派发需求准入 (HARD RULE)**：
   - 派发 `triage` agent → 分析原始 Issue 是否清晰、可执行、值得做，于工作目录下产出：`docs/triage/intake-<Issue>.md` 并进行准入裁决 `[GO | NO-GO | DISCOVERY]`。
3. **准入阻断门禁**：
   - 运行准入门禁校验子命令：
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" intake-check --phase-issue <phase_issue>
     ```
   - **拦截逻辑**：
     - 若判定为 `[NO-GO]`，直接物理阻断（exit 1），强制关闭 Issue 或退回人工治理，工作流在此终止。
     - 若判定为 `[DISCOVERY]`，则强制扭转状态机为只读探照状态，禁止拆分 sub-issue，仅允许运行 Probing 和 Discovery。
     - 若判定为 `[GO]`（且拦截级别不是 P0 阻断），通过门禁，进入 A0 阶段。

---

### 阶段 A0：建 Phase 分支与 worktree

1. 推断 Phase 所属的模块/功能名称（英文 kebab-case，例如 `login-module`），若有歧义使用 AskUserQuestion 追问用户。
2. 创建 Phase 分支与独立的 phase worktree：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" branch-create --type phase --n <N> --slug <英文 kebab> --issue <phase_issue>
   ```
3. 后续所有 Phase 内操作都必须在生成的 phase worktree 目录下（`cd <phaseWorktreePath>`）执行；主仓库保持基线干净。
4. 在 phase worktree 内准备文档目录：
   ```bash
   mkdir -p docs/<功能名>/phase-<N>/
   ```

---

### 阶段 A1：拆 sub-issue 与现状探照 (Probing & Discovery)

1. **派发全库探波 (HARD RULE)**：
   - 派发 `probing` agent → 只读扫描代码库，检索存量相似实现、共用工具类和三方包依赖，物理输出独立探照报告：`docs/discovery/probing-<phase_issue>.md`。
   - **拦截逻辑**：若扫出 P0 级“严重重复造核心轮子”，阻断工作流，强迫架构锁定阶段复用已有资产。
2. 精读 Phase issue 的要求，参考 `probing` 探波报告中锁定的复用工具类，使用 `gh issue create` 创建 3-10 个 sub-issues（标题和描述强制使用中文）。
3. 绑定父子 issue 关系：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" issue-link-sub --parent <phase_issue> --child <sub_issue>
   ```
4. 明确 sub-issue 串行顺序（即 state-init 中 subIssues 数组的顺序）。
5. 初始化状态进度文件与效能 Metrics 看板：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" state-init \
     --phase-issue <phase_issue> \
     --branch "phase-<N>-<kebab>-#<phase_issue>" \
     --feature "<功能名>" \
     --sub-issues '[{"number":<n>,"title":"<标题>"},...]'
   ```
6. 向用户发起**【人工确认节点 1】**（AskUserQuestion 确认拆分结果与 Probing 复用清单）。

---

### 阶段 B：当前 sub-issue 准备、ADR 取舍与架构锁定

1. 在当前 phase worktree 下创建 sub-issue 分支：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" branch-create --type sub --n <N> --slug <英文 kebab> --issue <sub_issue> --from-phase-branch phase-<N>-...-#<phase_issue>
   ```
2. 更新进度与同步看板：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" state-advance --sub <sub_issue> --status in_progress --stage B
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" project-status --issue <sub_issue> --status "In progress"
   ```
3. **派发架构与设计梳理 (B 阶段) (HARD RULE)**：
   - 依次派发以下子 agents，各司其职，禁止并行写入相同文件：
     - `adr` agent → 对比多方案抉择 Trade-offs，产出独立物理文件：`docs/adr/adr-<sub_issue>.md`（包含备选对比、被放弃方案原因与反悔条件）。
     - `arch` agent → 产出 `docs/<功能名>/phase-<N>/<sub>/arch.md`（约束：架构契约三表、可观测性三表、数据迁移 Schema 与 NFR 安全约束表）。
     - `test` agent → 产出 `docs/<功能名>/phase-<N>/<sub>/test.md`（包含验收用例清单与回归校验方案）。
     - 仅当 sub-issue 标有 `needs-ui` 标签时，派发 `design` agent → 产出 `docs/<功能名>/phase-<N>/<sub>/design.md`（包含判定类型的设计验收与量测清单 Markdown 表格）。
4. **并发契约语义锁注册**：
   - 将当前分支锁定的白名单与冻结表写入全局契约看板：
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" contract-register --sub <sub_issue>
     ```
5. **提交设计文档契约**：
   - 在所有的设计文档落盘就绪后，执行提交并推送文档命令：
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" commit-docs --sub <sub_issue> --stage B
     ```
6. **【人工确认节点 2】**（AskUserQuestion 弹窗确认）：
   - 展示 ADR 决策与契约三表，展示是否有语义锁潜在重叠。询问：`sub-issue #N 的 ADR 决策与设计契约已生成。是否允许进入编码？`

---

### 阶段 C：编码阶段

1. **执行编码前门禁 precheck (HARD RULE - Graded)**：
   - 在派发编码 agent 前，**必须首先**运行以下命令进行确定性门禁校验：
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" precheck --sub <sub_issue>
     ```
   - **门禁拦截层级顺序**：
     `intake passed ➔ probing present ➔ arch/test/adr present ➔ contract-check (语义锁碰撞) ➔ 原三表校验 ➔ coding`
   - **如果 precheck 报 P0 错误，严禁派发 coding agent！** 必须物理阻断并结构化上报。
2. 更新进度至 C 阶段：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" state-advance --sub <sub_issue> --status in_progress --stage C
   ```
3. spawn 一个 `coding` agent 进行受控编码。
4. 编码 agent 编写并 commit 推送完后，若有 `🚨 NEEDS_USER_INPUT` 则转 AskUserQuestion 裁决，正常则继续。

---

### 阶段 D：验收阶段与混沌红蓝防御

1. 更新进度文件：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" state-advance --sub <sub_issue> --status in_progress --stage D
   ```
2. **派发测试、审查与混沌对抗 (D 阶段) (HARD RULE)**：
   - 并行派发以下子 agents：
     - `test` agent → 产出 `docs/<功能名>/phase-<N>/<sub>/test-report.md`（要求：在 worktree 跑测试，调用 gate 进行真绿判定）。
     - `review` agent → 产出 `docs/<功能名>/phase-<N>/<sub>/review-report.md`（约束：核对白名单越界、对齐 UI 验收与量测清单，强审计可观测性日志级别与脱敏规范）。
     - `chaos` agent → 产出 `docs/test/chaos-report-<sub_issue>.md`（约束：只读审计异常静默吞噬、空值注入防御、高并发竞态与超时 Fallback 控制，禁止改代码）。
   - 若 `test` agent 的 `gate --sub <sub_issue>` 失败，按 `workflowGates.debug` 处理：
     - 未配置或 `block`：自动派发 `debug` agent，产出 `docs/<功能名>/phase-<N>/<sub>/debug-report.md`，评论当前 sub-issue 后阻断流程，等待 `/debug confirm <sub_issue>`。
     - `warn`：自动派发 `debug` agent 并评论诊断报告，但保留普通 gate 失败状态。
     - `off`：不自动派发 Debug，沿用原有 blocked 行为。
   - `debug` agent 只允许补带 `ORCH_DEBUG_TEMP:<sub>:<attempt>` 标记的临时日志、无头复现和生成修复计划；确认后的修复必须交给 `coding` agent。
3. **混沌破坏门禁拦截**：
   - PR 提单前，执行混沌门禁强核对：
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" chaos-gate --sub <sub_issue>
     ```
   - 若存在 P0 级严重异常静默吞噬或缺 fallback，阻断工作流，强制 coding 重修自愈。
4. **提交验收文档报告**：
   - 验证通过后，运行提交命令：
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" commit-docs --sub <sub_issue> --stage D
     ```
   - 若本 sub 产生了 `debug-report.md`，该命令会随 D 阶段报告一并提交；临时日志本身不得提交。

---

### 阶段 E：PR 创建与 Release 规划

1. 更新进度至 E 阶段：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" state-advance --sub <sub_issue> --status in_progress --stage E
   ```
2. **派发发布与回滚规划**：
   - 派发 `release` agent → 产出 `docs/release/release-plan-<sub_issue>.md`（详细标定 Feature Flag 灰度开关、生产一键物理回退 Runbook 以及数据结构 Migration 的补偿 SQL 语句）。
3. **发布前门禁校验**：
   - 执行发布计划硬核审计：
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" release-check --sub-issue <sub_issue>
     ```
   - 若数据库迁移任务（带有 db-migration 标签且 migrationCheck 为 true）缺失了 down.sql 物理脚本或缺失一键回滚 Runbook，判定为 P0 阻断。
4. 为 sub-issue 创建 PR：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" pr-create-sub \
     --phase-branch "phase-<N>-...-#<phase_issue>" \
     --sub-branch "sub-<N>-...-#<sub_issue>" \
     --sub-issue <sub_issue> \
     --title "<中文标题>" \
     --summary "<PR 摘要>" \
     --risk "已生成 docs/release 物理回退 Runbook"
   ```
5. 更新状态为 `pr_created`：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" state-advance --sub <sub_issue> --status pr_created --pr <prNumber>
   ```

---

### 阶段 E-2：Post-Merge 交付校验、Retro 与规则自进化编译

1. 当所有串行 sub-issue 均已合并，主会话调用以下命令运行交付级核准（或由 PR 合并 Hook 触发）：
   ```bash
   /orch post-merge <phase_issue>
   ```
2. **Post-Merge 自动化核准（交付工作流）**：
   - 状态机自动拉取最新主干分支运行真绿验证（`gate` 门禁断言）。
   - 自动探测预发/部署健康检查端点是否可用（Ping 校验）。
   - 自动在 GitHub Project 看板上将该 Phase Issue 状态扭转为 Done 并物理关闭 Issue。
3. **全局架构文档同步检查（Markdown 活文档）**：
   - 在创建 Phase 整体 PR 前运行确定性检查：
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" architecture-docs-check --phase-issue <phase_issue> --dry-run
     ```
   - 若 JSON 中 `decision` 为 `update-required`，派发 `architecture-docs` agent，按 `targetDocs` 更新 `docs/architecture/` 中对应 Markdown。
   - 若 JSON 中 `decision` 为 `conservative-update`，派发 `architecture-docs` agent，仅追加 `docs/architecture/changelog.md` 的短记录与人工复核提示。
   - 若 JSON 中 `decision` 为 `no-op`，不修改架构文档。
   - **边界 (HARD RULE)**：全局架构文档只描述长期结构和导航；具体任务契约仍以 `docs/<feature>/phase-<N>/<sub>/arch.md` 为唯一依据。架构文档变更随 Phase PR 合入，不在 post-merge 中直接提交到主干。
4. 创建 Phase 整体交付 PR（若有必要）且执行 worktree 清理：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" pr-create-phase --phase-issue <phase_issue>
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" worktree-remove --phase-issue <phase_issue>
   ```
5. **Retro 复盘与规则自演进编译器激活**：
   - **派发门控 (HARD RULE)**：**仅当项目配置中 `retro.enabled` 不为 `false` 时**，才启动 Retro 自演进：
     - 派发 `retro` agent → 总结踩坑记录、根本原因、防错规则，产出 `docs/retro/retro-phase-<N>.md`。
     - 派发 `guardrail-compiler` agent → 读取 retro，自动将踩坑规约编译为配置与钩子规则 diff，产出候选防御清单 `docs/retro/guardrail-candidate-diffs-<Phase>.md`。
     - 运行规则演进 Dry-Run，输出候选 diff 待人类确认：
       ```bash
       node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" guardrail-compile --phase-issue <phase_issue> --dry-run
       ```
     - 提示人类输入确认，以合入物理配置（`.orch/config.json` 及 Hooks 正则表达式），闭合全链路“自进化”研发环。
   - 若项目配置 `retro.enabled` 设为了 `false`，则在清理 worktree 后直接宣布 Phase 交付全面闭环，跳过并省略派发 Retro 与自演进编译器环节。
