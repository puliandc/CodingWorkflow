# CodingWorkflow 架构总览

本目录是 `CodingWorkflow` 的全局架构地图，用来帮助维护者快速理解项目结构、流程入口和核心模块关系。

## 单一真相边界

- 全局架构文档只解释稳定结构、流程和导航。
- 具体任务的文件白名单、冻结表、回归护栏仍以 `docs/<feature>/phase-<N>/<sub>/arch.md` 为唯一依据。
- 本目录不得替代 Phase 级 `arch.md`，也不得记录任务级临时决策。

## 读者路径

1. 先读 [模块地图](module-map.md)，了解目录职责和核心入口。
2. 再读 [流程图](flow.md)，理解 `/orch`、CLI、agent 和 hook 的协作顺序。
3. 开发中如修改架构相关路径，按 [维护映射](maintenance-map.json) 更新对应文档。
4. 不确定是否属于架构变化时，只追加 [架构变更日志](changelog.md) 的保守记录，避免大段误写。

## 维护原则

- Markdown 优先，方便 PR diff 和代码审查。
- 每次 post-merge 都运行架构文档检查，但只有命中映射或不确定时才更新。
- 文档变更随 Phase PR 合入，不在 post-merge 中直接写主干。
