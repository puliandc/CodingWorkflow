# Retro 复盘教训与 AI 防错规则 — Phase 1

## 1. 踩坑记录 (Pitfalls)
- **现象**：测试时遇到了物理 Segfault 崩溃且没有被三硬门禁阻断。

## 2. 根本原因分析 (Root Cause)
- 缺少致命报错过滤。

## 3. 具体防错规则 (Prevention Rules)
- 强制拦截 Segfault 异常。

## 4. 可编译防错规约候选 (JSON)

```json
{
  "greenVerdict": {
    "errorKeywords": ["Fatal Segfault Exception"]
  },
  "whitelistEnforcePaths": ["src/config/secrets/"],
  "preToolUseHooks": [
    {
      "pattern": "Object\\.prototype\\.pollution",
      "explanation": "禁止污染对象原型链"
    }
  ]
}
```
