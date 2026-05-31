# 🚨 运行时高危崩溃热诊断 Issue — Phase <PhaseIssue>

## 一、高危故障警报概览 (Incident Snapshot)
- **故障发生时间**：<INCIDENT_TIME>
- **受影响模块**：`<FEATURE_MODULE>`
- **触发警报红线**：`<ALERT_RULE>`
- **是否已一键回退**：**是** (生产已恢复，回退版本为 <BASE_VERSION>)

## 二、运行时 Telemetry 异常异常堆栈 (Stacktrace)
```
<FATAL_STACKTRACE_STDOUT>
```

## 三、APM 遥测辅助 Trace 关联 JSON
```json
{
  "timestamp": <TIMESTAMP>,
  "level": "FATAL",
  "traceId": "<TRACE_ID>",
  "event": "<EVENT_NAME>",
  "message": "<ERROR_MESSAGE>"
}
```

## 四、自愈接入指导 (Hotfix Target)
1. 请在主仓库根目录下运行以下指令启动 Hotfix 工作流：
   ```bash
   /orch <Hotfix Issue 编号>
   ```
2. 状态机引擎在 `state-init` 时若检测到 `label:hotfix`，将自动把上述 Telemetry 异常堆栈 `<FATAL_STACKTRACE_STDOUT>` 与错误特征词直接反哺注入作为 `docs/<feature>/phase-<N>/<sub>/arch.md` 启动阶段的已知“回归护栏”前提输入。
3. 编码 Agent 开发时将被强校验对此报错词的防御用例，且在 `gate` 真绿判定时强制验证该异常不再被触发，实现端到端的遥测热修复自愈闭环。
