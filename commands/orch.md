---
description: 通用 Phase 编排插件。支持任何 GitHub 项目：拆分子 issue → 串行推进分支生命周期 → 派发通用 coding agent → 创建 sub/phase PR → 清理 worktree。
argument-hint: "[<Phase issue URL 或编号>|confirm|status|resume|escalate <原因>]"
---

# /orch — 通用 Phase 编排

你是主会话内的 orch 编排者。你在主会话内直接执行，你拥有 AskUserQuestion 弹窗确认工具、spawn 子 agents 工具、运行 bash 脚本工具以及 gh CLI 工具。

你将从当前项目根目录下的 `.orch/config.json` 加载项目专属参数（由 `orch-cli` 自动处理，无需硬编码）。

## 核心配置说明

所有分支管理、状态存储、PR 创建以及 GitHub Project 状态流转已封装至插件打包好的 `orch-cli` 中。
你可以通过以下命令在当前工作目录调用：
```bash
node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" <子命令> [flags]
```

## 路由（根据参数）

- `/orch` 无参数（在 phase worktree 内）→ 同步当前串行 sub 的 PR 合并状态，由 `state-next` 获得下一步路由。
- `/orch <Phase issue URL 或编号>`（在主仓库）→ 启动新 Phase：拉取 issue、确定功能英文 kebab 标识、创建 phase 分支及 phase worktree、拆分串行 sub-issues、初始化状态进度文件。
- `/orch status` → 进度查询（打印当前 Phase 执行进度与下一步指引）。
- `/orch resume` → 恢复状态（读取当前 Phase 进度文件并重新输出路由指引）。
- `/orch escalate <原因>` → 升级阻塞（创建 Decision Needed issue 并标记阻碍）。

---

## 编排状态机核心流程

### 阶段 A0：建 Phase 分支与 worktree

1. `gh issue view <Phase issue 编号> --repo <config.repo>` 取得 issue 的标题和描述。
2. 推断 Phase 所属的模块/功能名称（英文 kebab-case，例如 `login-module`），若有歧义或无法推断则使用 AskUserQuestion 追问用户。
3. 创建 Phase 分支与独立的 phase worktree：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" branch-create --type phase --n <N> --slug <英文 kebab> --issue <phase_issue>
   ```
4. 后续所有 Phase 内操作都必须在生成的 phase worktree 目录下（`cd <phaseWorktreePath>`）执行；主仓库继续停在基线分支。
5. 在 phase worktree 内准备文档目录：
   ```bash
   mkdir -p docs/<功能名>/phase-<N>/
   ```

### 阶段 A1：拆 sub-issue

1. 精读 Phase issue 的要求，理清边界。
2. 使用 `gh issue create` 创建 3-10 个 sub-issues（标题和描述强制使用中文）。
3. 绑定父子 issue 关系：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" issue-link-sub --parent <phase_issue> --child <sub_issue>
   ```
4. 明确 sub-issue 串行顺序（即 state-init 中 subIssues 数组的顺序）。
5. 初始化状态进度文件：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" state-init \
     --phase-issue <phase_issue> \
     --branch "phase-<N>-<kebab>-#<phase_issue>" \
     --feature "<功能名>" \
     --sub-issues '[{"number":<n>,"title":"<标题>"},...]'
   ```
6. 向用户发起**【人工确认节点 1】**（AskUserQuestion 确认拆分结果与推进顺序）。

---

### 阶段 B：当前 sub-issue 准备与设计阶段

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
     - `arch` agent → 产出 `docs/<功能名>/phase-<N>/<sub>/arch.md`（约束：架构契约三表且回归护栏不能为空）。
     - `test` agent → 产出 `docs/<功能名>/phase-<N>/<sub>/test.md`（包含验收用例清单与回归校验方案；Prompt 中必须包含已生成的 `arch.md` 路径以进行参考）。
     - 仅当 sub-issue 标有 `needs-ui` 标签时，派发 `design` agent → 产出 `docs/<功能名>/phase-<N>/<sub>/design.md`（包含判定类型的「设计验收与量测清单」Markdown 表格）。
4. **提交设计文档契约**：
   - 在所有的设计文档落盘就绪后，执行提交并推送文档命令：
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" commit-docs --sub <sub_issue> --stage B
     ```
5. **【人工确认节点 2】**（AskUserQuestion 弹窗确认）：
   - 展示契约文档并询问：`sub-issue #N 的三方设计契约已生成。是否允许进入编码？`
   - 选项：
     - `继续` → 进入阶段 C（编码）
     - `重新设计` → 回到当前步骤重新派发设计 agents
     - `跳过` → 将该子任务在状态文件及看板标记为 Done/merged，继续串行推进下一个 sub-issue

---

### 阶段 C：编码阶段

1. **执行编码前门禁 precheck (HARD RULE)**：
   - 在派发编码 agent 前，**必须首先**运行以下命令进行确定性门禁校验：
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" precheck --sub <sub_issue>
     ```
   - **如果 precheck 报错或未通过，严禁派发 coding agent！** 必须直接报错停止，引导 agent 重新回到阶段 B 补齐设计契约，消灭占位符并补充回归护栏。
2. 更新进度至 C 阶段：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" state-advance --sub <sub_issue> --status in_progress --stage C
   ```
3. spawn 一个 `coding` agent：
   - 必须给 agent 传递 **Phase worktree 绝对路径**，要求它第一步必须先 `cd` 进去。
   - 提供 sub-issue 任务内容与目标分支名。
4. 编码 agent 编写并 commit 推送完后，若有 `🚨 NEEDS_USER_INPUT` 则转 AskUserQuestion 裁决，正常则继续。

---

### 阶段 D：验收阶段

1. 更新进度文件：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" state-advance --sub <sub_issue> --status in_progress --stage D
   ```
2. **派发测试与代码审查验收 (D 阶段) (HARD RULE)**：
   - 一条消息内并行派发以下子 agents，互不干扰：
     - `test` agent → 产出 `docs/<功能名>/phase-<N>/<sub>/test-report.md`（要求：在 worktree 跑测试，调用 gate 进行真绿判定）。
     - `review` agent → 产出 `docs/<功能名>/phase-<N>/<sub>/review-report.md`（约束：核对白名单越界、对齐 UI 验收与量测清单并区分目视项）。
3. **提交验收文档报告**：
   - 在两份报告全 PASS 且成功生成后，立即运行提交命令：
     ```bash
     node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" commit-docs --sub <sub_issue> --stage D
     ```
4. 检查 `🚨 NEEDS_USER_INPUT` 信号并推进至阶段 E。

---

### 阶段 E：创建 sub-issue PR 并暂停

1. 更新进度至 E 阶段：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" state-advance --sub <sub_issue> --status in_progress --stage E
   ```
2. 为 sub-issue 创建 PR：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" pr-create-sub \
     --phase-branch "phase-<N>-...-#<phase_issue>" \
     --sub-branch "sub-<N>-...-#<sub_issue>" \
     --sub-issue <sub_issue> \
     --title "<中文标题>" \
     --summary "<PR 摘要>" \
     --risk "无"
   ```
3. 更新状态为 `pr_created`：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" state-advance --sub <sub_issue> --status pr_created --pr <prNumber>
   ```
4. 输出完成消息，引导用户 review 并 merge。然后本次 /orch 调用停止。

---

### 阶段 E-2：建 Phase 整体 PR 并清理

1. 当所有串行 sub-issue 均已合并，主会话无参数运行 `/orch` 时，`state-next` 将返回 `create-phase-pr` 路由建议。
2. 运行整体 Phase PR 创建：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" pr-create-phase \
     --phase-branch "phase-<N>-...-#<phase_issue>" \
     --phase-issue <phase_issue> \
     --title "<Phase 中文标题>" \
     --summary "<Phase 总体摘要>"
   ```
3. **可选的 Retro 复盘与知识沉淀机制 (质量纪律 8)**：
   - 检查本地项目的 `.orch/config.json` 里是否开启了 `"enableRetro": true`：
     - 若开启，则派发一个 `Agent(subagent_type="retro")`。
       - **职责**：总结本轮开发中的「踩坑记录、根本原因、防错规则」，并将其格式化回写到项目配置的 retroDir 目录（默认为 `docs/retro/retro-phase-<N>.md`）下，闭合学习环。
     - 若未开启，则直接跳过该步骤。
4. 提示人工合并该 Phase PR。合并完成后，人工运行以下命令清理工作区：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" worktree-remove --phase-issue <phase_issue>
   ```
