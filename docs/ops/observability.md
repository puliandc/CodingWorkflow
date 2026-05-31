# 📡 CodingWorkflow 厂商无关可观测性契约规范 (Observability Specification)

本规范定义了 `CodingWorkflow` 架构中**可观测性（Observability）**的通用设计标准。本标准与任何具体的 APM（如 Datadog、Dynatrace、Jaeger、Prometheus、Grafana 等）或日志收集厂商解耦，致力于将可观测性确立为软件架构设计期的**一等公民契约（First-Class Contract）**。

---

## 📂 契约一：结构化日志事件规格 (Event Logging Schema)

所有新增的业务关键代码与接口逻辑，必须遵循**结构化 JSON 日志规格**。严禁输出任何裸字符串（如 `logger.info("user login ok")`）或未脱敏日志。

### 1. 结构化日志必带字段
每条核心日志必须包含以下标准 Context 字段以方便分布式 Trace：
```json
{
  "timestamp": 178239019,
  "level": "INFO | WARN | ERROR | FATAL",
  "traceId": "t-839210-abcdef",
  "spanId": "s-12903",
  "featureModule": "<英文 kebab 标识，如 login-module>",
  "event": "<大写蛇形事件名，如 USER_REGISTER_SUCCESS>",
  "message": "<便于人类阅读的简短中文描述>",
  "payload": {}
}
```

### 2. GDPR 与 PII 敏感数据脱敏红线 (PII Filtering)
> [!CAUTION]
> 严重安全 P0 红线：严禁在日志中输出任何明文敏感信息！

所有符合以下特征的数据，在写入日志的 `payload` 或 `message` 之前，必须在 AST 层面或通过公用工具类执行**物理遮蔽（Masking）**：
- **用户密码/Token/私钥**：强制完全擦除，替换为 `[MASKED_SECURITY_ASSETS]`。
- **手机号/身份证号**：强制只留前 3 后 4 位，中间遮蔽，例如 `138****9900`。
- **真实姓名/银行卡/邮箱**：强制执行单向 SHA-256 哈希或部分遮蔽。

---

## 📊 契约二：指标打桩与警报阈值契约 (Metrics & Alerting)

每个 Phase 或 Sub-issue 合并上线后，必须在 APM 中自动注册或更新以下**四大黄金 KPI 指标基线**：

| 指标命名 | 物理含义 | 观测分位数/聚合 | 严重拦截警报红线 (Trigger P0 Rollback) |
| --- | --- | --- | --- |
| `http_request_duration_ms` | 请求接口延迟时延 | P99 (百分之九十九分位数) | 在 5 分钟观察窗口内，核心接口延迟 `> 500ms` |
| `service_error_rate` | 运行时接口未捕获异常率 | Rate (比率) | 异常率 `> 0.05%` (或单点连续发生 5 次) |
| `cpu_utilization_ratio` | 容器 CPU 资源占用率 | Average (平均值) | CPU 持续 2 分钟处于 `> 85%` 高位 |
| `memory_leak_slope` | 内存堆栈增长斜率 | Slope (线性斜率) | 内存线性斜率持续 30 分钟为正（疑似内存泄漏） |

---

## 🔗 契约三：链路追踪与打桩传播 (Distributed Tracing Schema)

1. **Span Context 传播**：跨进程、跨 HTTP/RPC 调用时，必须在 Header 中强制携带 `x-trace-id` 与 `x-span-id`。
2. **打桩锚点 (Tracing Instrumentation)**：
   - 核心业务入口（Controller、Message Queue Consumer）必须新建 **Root Span**。
   - 外部数据库查询、RPC 调用或 Redis 交互必须新建 **Child Span**，并标记 `db.statement` 或 `peer.service`。

---

## 🧬 契约四：运行时 Telemetry 异常回流与热修复自愈 (Self-Healing Loop)

本部分规范定义了生产环境 APM / 遥测发生 P0 级警报触发回滚后，如何将运行时信号反哺开发工作流：

### 1. 自动生成 Hotfix Issue 模板
当运行时警报发生并执行一键物理回退后，APM 平台或监控平台自动通过 GitHub GraphQL API 发起一个带 `label:hotfix` 和 `label:observability-breach` 的 **Hotfix Issue**。模板如下：

```markdown
# 🚨 运行时高危崩溃热诊断 Issue — Phase <N>

## 一、高危故障警报概览 (Incident Snapshot)
- **故障发生时间**：2026-05-31T15:20:00Z
- **受影响模块**：`login-module`
- **触发警报红线**：`service_error_rate > 0.05%` (实测为 1.2%)
- **是否已执行回退**：**是 (已一键物理回滚至上一版本，生产恢复正常)**

## 二、运行时 Telemetry 异常异常堆栈 (Stacktrace)
```
Fatal Segfault Exception: Cannot read property 'id' of null
  at [src/utils/user-parser.ts:L34](src/utils/user-parser.ts#L34) (parseUserData)
  at [src/domain/login.ts:L112](src/domain/login.ts#L112) (executeLoginFlow)
```

## 三、APM 遥测辅助 Trace 信息
- **TraceId**: `t-839210-abcdef`
- **日志报错上下文**:
```json
{
  "timestamp": 178239019000,
  "level": "FATAL",
  "traceId": "t-839210-abcdef",
  "event": "USER_LOGIN_CRASH",
  "message": "NPE occurred in parsing phase"
}
```

## 四、自愈接入指导 (Hotfix Target)
1. 请运行 `/orch <Hotfix Issue 编号>` 自动创建热修复隔离 worktree。
2. 上述运行时堆栈与 TraceId JSON 已被自动注入并装载作为本次启动后阶段 B 中 `arch.md` 的已知架构回归护栏，强制补充对此空指针异常的防御用例。
```

---

## 🚫 可观测性审查物理拦截规则

- `review` Agent 在进行 D 阶段代码审计时，必须根据本规范的 `PII Filtering` 与 `Event Logging Schema` 强制审查 AST 变更：
  - 若发现有裸 `console.log(Token)` 或裸 `logger.error(password)` 的明文敏感泄漏，直接物理拦截 PR。
  - 若发现日志未携带 `traceId`，或新暴露的 API 缺失 APM 核心指标打桩，触发 P1 警告或 P0 阻断。
