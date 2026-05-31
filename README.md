# CodingWorkflow — 全生命周期自演进 AI 工程工作流与纪律引擎

`CodingWorkflow` 是一个将**全生命周期 Phase 编排状态机**、**并发契约语义锁**、**红蓝混沌防御验证**与**遥测热闭环自进化**深度融合的跨项目通用 AI 软件工程 (AISE) 纪律引擎。

通过在项目根目录提供一份简单的 `.orch/config.json` 配置文件，即可让任何项目（不论何种开发语言，不论是前端、Node 还是 Godot/Godot-Mono 等游戏项目）瞬间接入一整套从需求准入治理、现状探照、ADR方案取舍、并发语义锁、混沌注入、到发布回滚和可观测性闭环的工业级全生命周期研发流。

---

## 🚀 核心优势

- **全生命周期准入治理**：在 Phase 启动前通过 `intake` 强校验需求可执行度；配合 `probing` 探波 Agent 只读扫描全库相似实现，防撞车并禁止重复造轮子。
- **并发契约语义锁 (Semantic Locking)**：通过全局 `Contract Registry` 看板注册各 sub-issue 的修改白名单与冻结表。在编码前阶段，多分支并发开发时自动进行语义冲突检测并 P0 阻断。
- **方案决策记录 (ADR Gate)**：强制架构设计阶段记录 Trade-offs，留存被放弃方案与反悔条件，防止 AI 顺手选择表面合理实则错误的方案。
- **分级阻断工程策略 (Graded Policy)**：门禁校验分为 P0 阻断、P1 告警、P2 记录。支持配置式 `workflowGates (block | warn | off)`，实现严格纪律与高效交付的动态平衡。
- **红蓝混沌负向校验 (Chaos Gate)**：引入混沌 Agent，故意在沙箱测试中针对空输入、超时、并发、三方接口失败与异常吞噬注入破坏性缺陷，强迫编码 AI 编写高韧性防御性代码。
- **自适应规则自进化 (Guardrail Compiler)**：`retro` 不再是死的文档资产。引擎自动读取踩坑记录，将其编译为 `.orch/config.json` 或钩子的规则 diff，通过人类确认后完成免疫升级。
- **厂商无关遥测闭环 (Telemetry Observability)**：代码上线后，将真实运行信号（错误率、延迟、异常堆栈）反哺工作流。一旦发生生产异常，自动触发热修复 Issue 并作为下一次架构锁定的已知上下文。

---

## 📂 插件目录布局

```
CodingWorkflow/
├── .claude-plugin/
│   ├── plugin.json         # 插件元数据定义
│   └── marketplace.json    # Marketplace 本地注册信息
├── commands/
│   └── orch.md             # slash command /orch 编排状态机 (全生命周期骨架)
├── agents/
│   ├── triage.md           # [NEW] 需求准入 Agent (产出 intake.md)
│   ├── discovery.md        # [NEW] 现状只读勘探 Agent (产出 discovery-report.md)
│   ├── arch.md             # 架构梳理 Agent (产出白名单、冻结表、ADR决策与回归护栏)
│   ├── adr.md              # [NEW] 方案对比 Agent (并入或独立产出方案取舍记录)
│   ├── design.md           # UI设计 Agent (产出量测清单)
│   ├── coding.md           # 通用编码 Agent (七启动 + 九停止条件)
│   ├── chaos.md            # [NEW] 混沌红蓝验证 Agent (产出 chaos-report.md)
│   ├── test.md             # 测试方案 Agent (门禁三硬判定)
│   ├── review.md           # 代码审查 Agent (越界合规、日志脱敏与可观测审计)
│   ├── release.md          # [NEW] 发布与回滚规划 Agent (产出发布 Runbook)
│   ├── retro.md            # 知识沉淀 Agent (产出 retro.md)
│   └── guardrail-compiler.md # [NEW] 规则编译器 Agent (生成门禁配置 diff)
├── hooks/
│   ├── hooks.json          # 全局 Hook 注册 (v2.1+ 自动扫描)
│   ├── guard-impl-access.sh       # 白名单越界确定性拦截
│   ├── validate-commit-msg.sh     # 提交日志合规校验
│   └── guard-context-pollution.sh # 上下文防污染 (禁止读完整 diff / log)
└── orch-cli/
    └── dist/index.js       # 编译打包好的状态机核心 CLI (包含并发语义锁、分级阻断与自进化编译逻辑)
```

---

## 🛠️ 新项目快速接入三步走

### 第一步：安装插件 (一次性)
克隆本仓库到您的本地目录（例如 `~/code/CodingWorkflow`），然后在您的 Claude 终端中执行：
```bash
# 注册本地 marketplace 并安装插件
/plugin marketplace add ~/code/CodingWorkflow
/plugin install codingworkflow
```

### 第二步：编写项目配置
在您需要接入工作流的项目的根目录下，创建 `.orch/config.json`：
```json
{
  "repo": "owner/name",
  "baseBranch": "origin/main",
  "worktreeDir": "../name-worktrees",
  "commitTypes": ["功能", "修复", "重构", "测试", "文档", "基建"],
  "whitelistEnforcePaths": ["src/", "scripts/"],
  "workflowGates": {
    "intake": "block",
    "probing": "warn",
    "adr": "block",
    "contractCollision": "block",
    "chaos": "block",
    "release": "block"
  },
  "commands": {
    "lint": "npm run lint",
    "format": "npm run format",
    "test": "npm run test"
  },
  "greenVerdict": {
    "successString": "tests passed successfully",
    "errorKeywords": ["Error", "Exception", "FAILED", "Parse Error"]
  }
}
```

### 第三步：开工！
在接入项目的仓库主分支（main/master）下，选定一个 GitHub Phase Issue，运行：
```bash
/orch <Phase Issue 编号或 URL>
```
即可开始享受全生命周期 AI 工程化流转！

---

## 🛡️ 注入的十条硬核质量纪律

1. **白名单确定性拦截 hook**：基于 pre-tool-use hook，编码时任何对白名单（`arch.md`）以外文件的 Edit/Write 均被机器当场直接拦截阻断，消灭人为越界漏洞。
2. **七项启动摘要 (HARD RULE)**：编码 agent 修改代码前，必须率先以固定模板复述目标、AC、冻结表、白名单与回归护栏，杜绝盲目写码。
3. **九类停止条件 (HARD RULE)**：语义、默认值、日志、回退方案或白名单越界有任何不决时，agent 必须立即停手并通过 `🚨 NEEDS_USER_INPUT` 结构化升级上报。
4. **并发契约语义锁碰撞校验**：分支锁定契约需注册至 Contract Registry。`contract-check` 进行物理比对，多分支并行时严禁修改他人已冻结的核心文件（P0级直接阻断）。
5. **ADR 取舍记录与反悔门禁**：架构锁定必须包含 2 种方案对比及反悔条件（Decision Reversibility Triggers），无 ADR 或无反悔指标则 P0 阻断。
6. **真绿 vs 伪绿判定**：不允许仅凭 exit 0 通过，必须命中成功串且不含错误词。
7. **红蓝混沌负向防线**：在验收阶段强制要求混沌 Agent 针对高并发、三方挂掉、空值注入等异常进行破坏性负向安全审查，若缺 fallback 则 P0 阻断。
8. **设计量测清单**：`design.md` 产出量测清单，详细标定“Headless量测”与“手动目视”，阶段 D 精确比对。
9. **规则编译器自进化**：Retro 产生的具体防错教训由规则编译器编译为 `config.json` 候选差异 diff，经管理员交互确认后动态更新门禁库，实现生物级免疫自愈。
10. **全链路遥测数据热关联**：生产运行时 APM 指标与慢日志/崩溃堆栈通过 hotfix 工作流自动回流，反哺反向装载作为下一阶段开发的设计上下文，构建真自演进闭环。

