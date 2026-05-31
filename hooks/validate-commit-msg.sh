#!/usr/bin/env bash
# 提交信息格式验证 Hook
# 触发条件: PreToolUse → Bash，仅对 git commit 命令生效
# exit 0 = 允许, exit 2 = 阻止（stderr 反馈给 Claude）

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('command', ''))
except Exception:
    print('')
" 2>/dev/null)

# 只处理 git commit 命令
if ! echo "$CMD" | grep -qE "^git commit"; then
  exit 0
fi

# 获取工作区根
WORKTREE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$WORKTREE_ROOT" ]; then
  exit 0
fi

# 提取 -m 后的提交信息（支持单双引号，支持换行）
MSG=$(echo "$CMD" | python3 -c "
import sys, re
cmd = sys.stdin.read()
m = re.search(r\"-m\s+'([^']+)'\", cmd, re.DOTALL)
if not m:
    m = re.search(r'-m\s+\"([^\"]+)\"', cmd, re.DOTALL)
print(m.group(1).strip() if m else '')
" 2>/dev/null)

if [[ -z "$MSG" ]]; then
  echo "⚠️  无法解析提交信息，跳过格式校验" >&2
  exit 0
fi

# 从 config.json 中读取配置的 commitTypes，若未接入项目则优雅使用默认词
CONFIG_PATH="$WORKTREE_ROOT/.orch/config.json"
TYPES=""
if [ -f "$CONFIG_PATH" ]; then
  TYPES=$(python3 -c "
import json, sys
try:
    cfg = json.load(open(sys.argv[1]))
    types = cfg.get('commitTypes') or []
    if types:
        print('|'.join(types))
except:
    pass
" "$CONFIG_PATH" 2>/dev/null)
fi

# 兜底默认类型词
if [ -z "$TYPES" ]; then
  TYPES="功能|修复|重构|测试|文档|杂项|基建"
fi

# 检查格式：类型：简述（强制中文全角冒号「：」）
if ! echo "$MSG" | grep -qE "^($TYPES)：.+"; then
  echo "" >&2
  echo "❌ 提交信息格式错误" >&2
  echo "   当前: '$MSG'" >&2
  echo "   期望: 类型：简述" >&2
  echo "   类型限定: $(echo "$TYPES" | sed 's/|/ | /g')" >&2
  echo "   注意: 冒号必须使用中文全角冒号「：」" >&2
  echo "" >&2
  exit 2
fi

exit 0
