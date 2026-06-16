#!/usr/bin/env bash
# 提交信息格式验证 Hook
# 触发条件: PreToolUse → Bash，仅对 git commit 命令生效
# exit 0 = 允许, exit 2 = 阻止（stderr 反馈给 Claude）

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ti = d.get('tool_input') or {}
    print(d.get('command') or ti.get('command') or '')
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

# 定义配置文件路径
CONFIG_PATH="$WORKTREE_ROOT/.orch/config.json"

# 提取消息的高级 Python 脚本（支持 -m, -F/--file 文件, heredoc 格式）
MSG=$(echo "$CMD" | python3 -c "
import sys, re, os
cmd = sys.stdin.read()

# 1. 匹配 heredoc: <<'EOF'\n...\nEOF
heredoc_match = re.search(r\"<<\\s*['\\\"]?(\\w+)['\\\"]?\\n([\\s\\S]*?)\\n\\1\", cmd)
if heredoc_match:
    print(heredoc_match.group(2).strip())
    sys.exit(0)

# 2. 匹配 -F 或 --file
file_match = re.search(r\"(?:-F|--file)(?:\\s+|=)([^\\s'\\\"\\(|\\)]+|'[^']+'|\\\"[^\\\"]+\\\")\", cmd)
if file_match:
    file_path = file_match.group(1).strip(\"'\\\"\")
    if file_path != \"-\" and os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                print(f.read().strip())
                sys.exit(0)
        except:
            pass

# 3. 匹配 -m
m_match = re.search(r\"-m\\s+'([^']+)'\", cmd, re.DOTALL)
if not m_match:
    m_match = re.search(r'-m\\s+\"([^\"]+)\"', cmd, re.DOTALL)
if m_match:
    print(m_match.group(1).strip())
    sys.exit(0)

print('')
" 2>/dev/null)

if [[ -z "$MSG" ]]; then
  if [ -f "$CONFIG_PATH" ]; then
    echo "" >&2
    echo "❌ [P0 阻断] 无法从提交命令中解析出提交信息，为防止绕过，门禁已物理拦截。" >&2
    echo "   请使用标准的 git commit -m '类型：简述' 或 heredoc，并冒号使用全角「：」" >&2
    echo "" >&2
    exit 2
  else
    # 非接入项目，优雅放行
    exit 0
  fi
fi

# 从 config.json 中读取配置 of commitTypes，若未接入项目则优雅使用默认词
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
