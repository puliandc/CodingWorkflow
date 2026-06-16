# 模块地图

## 核心资产

| 路径 | 职责 |
| --- | --- |
| `.claude-plugin/` | Claude Code 插件清单，注册命令和 agents。 |
| `commands/` | `/orch`、`/debug` 等主会话命令流程说明。 |
| `agents/` | 各阶段 agent 的职责、输入输出和硬规则。 |
| `orch-cli/` | TypeScript CLI，执行状态推进、门禁、PR、post-merge 等确定性动作。 |
| `hooks/` | PreToolUse 与提交类物理拦截脚本。 |
| `.orch/` | 项目级配置、Phase 状态、契约注册表和模板。 |
| `docs/` | Phase 文档、运维文档、复盘文档和本架构总览。 |

## 稳定入口

| 入口 | 使用场景 |
| --- | --- |
| `commands/orch.md` | 主研发流程编排，从 intake 到 post-merge。 |
| `commands/debug.md` | Gate 失败后的诊断与确认流程。 |
| `orch-cli/index.ts` | CLI 子命令分发入口。 |
| `orch-cli/lib/state.ts` | Phase 状态、契约解析和 worktree 定位。 |
| `orch-cli/lib/config.ts` | `.orch/config.json` 配置加载和校验。 |

## 文档维护边界

架构总览维护只覆盖长期结构。任务级契约仍由 `agents/arch.md` 产出，并由 `precheck`、`contract-register`、hook 和 review agent 消费。
