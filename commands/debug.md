---
description: 诊断工作流入口。支持手动拉起 Debug Agent 定位 Bug，并在人工确认后复用 coding Agent 执行修复计划。
argument-hint: "<sub-issue 编号>|confirm <sub-issue 编号> [--dry-run]"
---

# /debug — Debug 诊断与确认入口

你是主会话内的 `CodingWorkflow` Debug 编排者。你在主会话内直接执行，拥有 AskUserQuestion、spawn 子 agents、Bash 与 gh CLI 能力。

---

## 路由

- `/debug <sub_issue>`：手动拉起 `debug` agent，对当前 sub-issue 的验收 Bug 做诊断。
- `/debug confirm <sub_issue>`：人工确认最近一次 `debug-report.md` 中的修复计划，复用 `coding` agent 执行修复。
- 任意路径支持 `--dry-run`：只展示将执行的检查与 agent 调度，不产生 Git/GitHub/文件副作用。

---

## 手动诊断流程：`/debug <sub_issue>`

1. 确认当前位于 Phase worktree，或从状态文件读取 `phaseWorktreePath` 后切入该 worktree。
2. 读取 Phase 状态，确认 `<sub_issue>` 存在且当前处于可诊断状态。
3. 派发 `debug` agent，并在 prompt 中提供：
   - Phase worktree 绝对路径
   - sub-issue 编号
   - `docs/<功能名>/phase-<N>/<sub>/debug-report.md` 目标路径
   - 最近失败的测试命令或人工验收 Bug 描述
4. `debug` agent 最多进行 3 轮临时日志补充与无头复现。
5. `debug` agent 写入 `debug-report.md` 后，调用：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" debug-comment --sub <sub_issue> --report <debug-report-path>
   ```
6. 主会话停止，等待用户执行 `/debug confirm <sub_issue>`。

---

## 自动诊断入口：D 阶段 gate 失败

当 `/orch` D 阶段中的 `test` agent 调用 `gate` 失败时：

1. 读取 `.orch/config.json` 的 `workflowGates.debug`。
2. 若未配置，按 `block` 处理。
3. 若为 `off`，保持原有 gate 失败 blocked 行为，不拉起 Debug。
4. 若为 `warn`，拉起 Debug 并评论诊断报告，但流程仍保留普通 gate 失败状态。
5. 若为 `block`，拉起 Debug，评论诊断报告后阻断流程，等待 `/debug confirm <sub_issue>`。

---

## 确认修复流程：`/debug confirm <sub_issue>`

1. 读取 `docs/<功能名>/phase-<N>/<sub>/debug-report.md`。
2. 若报告不存在、缺少“修复计划”、或结论为“未定位”，立即停止并要求人工补充。
3. 将报告中的“修复计划”“日志证据”“必须清理的临时日志标记”传给 `coding` agent。
4. `coding` agent 必须复用既有编码纪律：
   - 七项启动摘要
   - 九类停止条件
   - 文件白名单与冻结表
   - 需要正式日志转正时触发 `NEEDS_USER_INPUT`
5. 修复完成后必须运行：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" debug-clean-check --sub <sub_issue>
   ```
6. 清理检查通过后回到 D 阶段：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/orch-cli/dist/index.js" gate --sub <sub_issue>
   ```
7. gate 通过后继续原流程的 `review` 与 `chaos` 验收。

---

## 安全规则

- Debug 不直接修复业务代码。
- Debug 临时日志默认不提交。
- Debug 证据和修复计划只评论到当前 sub-issue。
- 任何 GitHub 评论失败都必须报告真实错误并暂停。
- 不读取、不打印、不修改任何密钥、Token、`.env` 或凭据文件。
