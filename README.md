# CodingWorkflow — Config 驱动的通用 Claude Code 编排与质量纪律引擎

`CodingWorkflow` 是一个将**高度自动化的 Phase 编排状态机**与**确定性工程质量纪律**深度融合的跨项目通用插件。

通过在项目根目录提供一份简单的 `.orch/config.json` 配置文件，即可让任何项目（不论何种开发语言，不论是前端、Node 还是 Godot/Godot-Mono 等游戏项目）瞬间接入一整套从需求拆分、架构锁定、测试前置、到真绿校验与 PR 自动创建的专业敏捷工作流。

---

## 🚀 核心优势

- **单引擎自动化编排**：一键拆分 sub-issue，全自动分支/worktree 环境隔离，串行状态机稳定流转。
- **确定性质量拦截 Hook**：在 pre-tool-use 阶段机械式强校验「架构契约三表」，对越界修改和带病编码执行 100% 物理阻断。
- **真绿三硬判定**：彻底杜绝「exit 0 伪绿」自欺，要求：`退出码 0 ∧ 包含成功特征串 ∧ 无任何错误关键词` 三项全过才 PASS。
- **与项目技术栈深度解耦**：状态机编译为通用 TS/JS，随插件分发，被主会话通过 `$CLAUDE_PLUGIN_ROOT` 跨项目独立执行，新项目免装 npm 依赖，零误伤、fail-open 优雅降级。

---

## 📂 插件目录布局

```
CodingWorkflow/
├── .claude-plugin/
│   ├── plugin.json         # 插件元数据定义
│   └── marketplace.json    # Marketplace 本地注册信息
├── commands/
│   └── orch.md             # slash command /orch 编排状态机
├── agents/
│   ├── arch.md             # 架构梳理 Agent（产出契约三表）
│   ├── design.md           # UI设计 Agent（产出量测清单）
│   ├── coding.md           # 通用编码 Agent（七启动+九停止条件）
│   ├── test.md             # 测试方案 Agent（门禁三硬判定）
│   └── review.md           # 代码审查 Agent（越界合规与量测审计）
├── hooks/
│   ├── hooks.json          # 全局 Hook 注册（v2.1+ 自动扫描）
│   ├── guard-impl-access.sh       # 白名单越界确定性拦截
│   ├── validate-commit-msg.sh     # 提交日志合规校验
│   └── guard-context-pollution.sh # 上下文防污染（禁止读完整 diff / log）
└── orch-cli/
    └── dist/index.js       # 编译打包好的状态机核心 CLI
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
即可开始享受全自动化的统一纪律工作流！

---

## 📝 `.orch/config.json` 全字段配置说明

| 字段 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| `repo` | `string` | **是** | 远端 GitHub 仓库完整路径（例如 `puliandc/CodingWorkflow`）。 |
| `baseBranch` | `string` | **是** | 本项目的基线主分支（例如 `origin/main`）。 |
| `worktreeDir` | `string` | 否 | linked worktrees 存放的相对或绝对路径（缺省时默认为主仓库同级 `../<repo-name>-worktrees`）。 |
| `project` | `object` | 否 | GitHub Project V2 看板集成参数，配置后自动进行状态扭转。 |
| `commitTypes` | `array` | 否 | 允许使用的 Git commit 类型前缀列表（若不配则拦截 hook 默认放行或采用常用前缀）。 |
| `whitelistEnforcePaths` | `array` | 否 | 编码前 precheck 期间拦截修改的敏感核心代码路径列表。 |
| `commands` | `object` | 否 | 配置 lint / format / test 的真实外部执行命令（例如 `npm run lint`）。 |
| `greenVerdict` | `object` | 否 | 配置“真绿门禁”三硬判定所必需的成功特征串 `successString` 与报错过滤词列表 `errorKeywords`。 |

---

## 🛡️ 注入的八条硬核工程质量纪律

1. **白名单确定性拦截 hook**：基于 pre-tool-use hook，编码时任何对白名单（`arch.md`）以外文件的 Edit/Write 均被机器当场直接拦截阻断，消灭人为漏洞。
2. **七项启动摘要**：编码 agent 修改代码前，必须率先以固定模板复述目标、AC、冻结表、白名单与护栏，杜绝盲目写码。
3. **九类停止条件**：语义、默认值、日志、回退方案或白名单越界有任何不决时，agent 必须立即停手并通过 `🚨 NEEDS_USER_INPUT` 结构化升级上报。
4. **架构契约三表**：`arch.md` 强制由文件白名单、冻结表与回归护栏组成，必须为结构化 Markdown 表格。
5. **真绿 vs 伪绿判定**：不允许仅凭 exit 0 通过，必须命中成功串且不含错误词。
6. **编码前 precheck 门禁**：消灭占位符（如 `[待填写]`），检查契约三表是否齐全，不齐直接阻断。
7. **设计量测清单**：`design.md` 产出量测清单，详细标定“Headless量测”与“手动目视”，阶段 D 精确比对。
8. **知识沉淀 retro**：合并 Phase 后总结教训。
