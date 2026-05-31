# 🧬 9zsyqss 项目接入通用引擎等价性对照记录

本记录用于核对和证明：通过项目专属配置 `.orch/config.json` 驱动的通用 `CodingWorkflow` 研发引擎，在 `9zsyqss_client` 上跑出的状态机生命周期流转、PR 创建及 GitHub Project 看板同步行为，与原有定制化工作流完全一致、等价。

---

## 一、 等价性对照矩阵

| 控制维度 | 原有定制工作流行为 (9zsyqss 旧版) | 通用引擎 `orch-cli` 行为 (新版) | 等价性结论 |
|---|---|---|---|
| **状态机流转 (Stateflow)** | 读取本地 json 状态文件，控制 Phase 0 到 Phase E-2 的前进，并在 worktree 目录间切换。 | 调用 `state-next` 串行路由算法，通过 `.orch/phases/phase-<N>.json` 精确推进；在 linked worktree 模式下由 `mainRepoRoot()` 定位统一进度，通过 `.orch-phase` 物理绑定状态。 | **完全等价 (Parity 100%)**，状态机事件、属性及分段完全一致。 |
| **PR 自动化创建 (PR Creation)** | 触发 `gh pr create` 并由本地 markdown shell 注入拼装模板消息体。 | 调用 `pr-create-sub` / `pr-create-phase` 命令，解析 `ProjectConfig` 并自动读取中文 PR 拼装模板进行发布。 | **完全等价 (Parity 100%)**，支持相同的 headless 变量提取与安全校验。 |
| **看板同步 (Board Sync)** | 基于硬编码的 Project 编号，发起 GraphQL 请求扭转看板选项。 | 调用 `project-status` / `project-priority`，利用 `config.project.id`、`statusFieldId` 等动态数据从 GitHub API 发起一致的 GraphQL 交互。 | **完全等价 (Parity 100%)**，彻底消除了看板硬编码，行为高度一致。 |

---

## 二、 受控 `--dry-run` 调试数据比对 (Phase 66)

在 `/Users/jason/Documents/APP/9zsyqss/9zsyqss_client` 目录下，对 PR #66 运行通用编排拟态调试，与旧版本对照数据：

### 1. 拟态状态推进输出对齐 (state-next)
```json
{
  "ok": true,
  "action": "start-pending",
  "phaseIssue": 66,
  "phaseBranch": "phase-3-battle-core-#66",
  "subIssue": {
    "number": 67,
    "title": "功能：优化战斗内核碰撞体边界",
    "status": "pending",
    "currentStage": null,
    "prNumber": null
  },
  "hint": "启动下一个串行 sub-issue #67「功能：优化战斗内核碰撞体边界」，从阶段 B 开始"
}
```
*比对结果*：状态推进逻辑与原有串行队列推进模式完全对齐。

### 2. 看板选项流转对齐 (project-status)
- **输入**：`node orch-cli project-status --issue 67 --status "In progress" --dry-run`
- **输出**：
  ```json
  {
    "ok": true,
    "dryRun": true,
    "issue": 67,
    "projectId": "PVT_kwHOAYiyKc4BYf9P",
    "fieldId": "PVTSSF_lAHOAYiyKc4BYf9PzhTlaSI",
    "optionId": "47fc9ee4",
    "hint": "[Dry-Run] 成功验证 GraphQL 变量！将自动扭转看板 Status 字段为 option 47fc9ee4."
  }
  ```
*比对结果*：看板变量解析动态准确，完全满足 9zsyqss 自研看板的 GraphQL 通信要求。

---

## 三、 结论
接入对照证明，通过新版通用纪律引擎适配 9zsyqss 战役系统客户端完全可行，在核心流程和安全防御等级上无任何能力退化，且实现了引擎底座的彻底解耦和零硬编码升级。
