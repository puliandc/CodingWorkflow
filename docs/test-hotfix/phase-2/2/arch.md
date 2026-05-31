# 架构设计与契约锁定 — sub-issue #2

## 核心交付：架构契约五表

### 1. 文件白名单 (File Whitelist)
#### [契约] 文件白名单
| 允许路径 | 变更类型 | 说明 |
| --- | --- | --- |
| `src/main.ts` | 修改 | 主入口 |

### 2. 冻结表 (Frozen Paths)
#### [契约] 冻结表
| 冻结路径 | 说明 |
| --- | --- |
| `src/config/` | 严禁改动全局配置 |

### 3. 回归护栏 (Regression Guard)
#### [契约] 回归护栏
| 验证用例 | 期望结果 | 回归脚本 |
| --- | --- | --- |
| 登录流程手动验证 | 登录按钮可点且能正确跳至主页 | 必须确保不破坏主登录链路 |
| APM遥测自愈 | 确认不触发: NullPointerException: Cannot read property 'token' of undefi | 必须通过 gate 且不再触发此 APM 遥测异常 |

### 4. 可观测性三表 (Observability Schema)
#### [契约] 可观测性三表
| 观测载体 | 格式规格与指标名 | GDPR/PII 脱敏红线 | 说明 |
| --- | --- | --- | --- |
| 结构化 JSON 日志 | EVENT: `USER_LOGIN_CRASH` | password / token 完全遮蔽 | 无 |

### 5. 非功能需求与 Schema 迁移表 (NFR & Schema Migration)
#### [契约] 数据迁移与 Schema 契约
| 变更类型 | Schema up 迁移文件 | Schema down 回滚文件 | 冷热数据 Backfill 逻辑与 NFR 约束 |
| --- | --- | --- | --- |
| 无 | 无 | 无 | 无 |
