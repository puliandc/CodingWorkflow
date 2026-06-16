# 工作流结构

## 主链路

1. 主会话通过 `/orch` 读取 Phase issue，并初始化 Phase 状态。
2. triage、probing、adr、arch、test 等 agent 产出阶段文档。
3. `precheck` 读取 Phase 级 `arch.md` 和 `test.md`，执行编码前门禁。
4. coding agent 只在 `arch.md` 文件白名单内实现。
5. gate、review、chaos、release 等步骤完成验收与发布准备。
6. E-2 阶段运行架构文档检查，必要时派发架构文档维护 agent。
7. 架构文档变更随 Phase PR 合入。
8. post-merge 做主干 gate、健康检查、Issue 关闭和后续清理提示。

## 架构文档同步

`architecture-docs-check` 是确定性分类器，只判断是否需要维护全局架构文档，不直接写语义内容。

| 判定 | 含义 | 后续动作 |
| --- | --- | --- |
| `no-op` | 未发现全局架构影响。 | 不派发维护 agent。 |
| `update-required` | 变更路径命中维护映射。 | 派发维护 agent 更新对应 Markdown。 |
| `conservative-update` | 无法确认是否架构相关。 | 仅追加短变更日志和人工复核提示。 |

## 副作用边界

- CLI 输出 JSON，供 `/orch` 和测试稳定解析。
- CLI 不执行语义写作，不自动提交架构文档。
- post-merge 不直接向主干追加 docs-only commit。
