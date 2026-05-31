# Retro Phase 2 - 复盘报告

## 四、可编译防错规约候选 (JSON)

```json
{
  "greenVerdict": {
    "errorKeywords": ["Fatal Crash Test Exception"]
  },
  "whitelistEnforcePaths": ["src/high-risk/"],
  "preToolUseHooks": [
    {
      "pattern": "forbidden-action-xyz",
      "explanation": "禁止执行被强制拦截的 forbidden-action-xyz 测试行为！"
    }
  ]
}
```
