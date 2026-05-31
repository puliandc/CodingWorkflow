#!/usr/bin/env bash
# PreToolUse hook: 上下文防污染门禁
# exit 0 = 允许, exit 2 = 阻断
#
# 三条规则：
#   规则 1（Bash）：禁止主进程直接读完整 git diff（无 --stat 等过滤参数）
#   规则 2（Bash）：禁止 cat/less 直接读 .log 文件（head 合法）
#   规则 3（Read）：禁止直接 Read 原始 SVG/JSON/CSV 大文件
#
# Bypass：存在 $WORKTREE_ROOT/.orch/ctx-bypass 时，放行并自动删除 bypass 文件

INPUT=$(cat)

PARSED=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input') or {}
    tool_name = data.get('tool_name') or ''
    file_path = data.get('file_path') or ti.get('file_path') or ''
    command = data.get('command') or ti.get('command') or ''
    print(tool_name)
    print(file_path)
    print(command)
except Exception:
    print('')
    print('')
    print('')
" 2>/dev/null)

TOOL_NAME=$(echo "$PARSED" | sed -n '1p')
FILE_PATH=$(echo "$PARSED" | sed -n '2p')
COMMAND=$(echo "$PARSED" | sed -n '3p')

# 获取工作区根
WORKTREE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$WORKTREE_ROOT" ]; then
    exit 0
fi

# 核心安全判定：无 .orch/config.json 代表当前项目未接入 orch，优雅 no-op 放行！
CONFIG_PATH="$WORKTREE_ROOT/.orch/config.json"
if [ ! -f "$CONFIG_PATH" ]; then
    exit 0
fi

BLOCK_MSG=""

if [ "$TOOL_NAME" = "Bash" ] || [ "$TOOL_NAME" = "run_command" ]; then
    # 规则 1：完整 git diff
    if echo "$COMMAND" | grep -qE 'git diff'; then
        if ! echo "$COMMAND" | grep -qE '(--stat|--name-only|--name-status|--shortstat|--quiet)'; then
            BLOCK_MSG=$'⛔ 上下文防污染：禁止主进程直接读取完整的源码 git diff。\n   → 请委派子 subagent (如 Explore 或 Research) 执行详细代码分析。\n   → 合法用法：git diff --stat（仅查看修改文件列表）。\n   → 若此操作确实必要，可创建 .orch/ctx-bypass 文件（写明原因），然后重新运行。'
        fi
    fi

    # 规则 2：cat/less 读取大日志 .log 文件
    if [ -z "$BLOCK_MSG" ]; then
        if echo "$COMMAND" | grep -qE '\b(cat|less)\b[^|;&]*\.log\b'; then
            BLOCK_MSG=$'⛔ 上下文防污染：日志文件往往非常大，请用 tail -n 100，或委派专职子 Agent 分析，避免阻塞主进程。'
        fi
    fi
fi

if [ "$TOOL_NAME" = "Read" ] || [ "$TOOL_NAME" = "view_file" ]; then
    # 规则 3：Read 原始大文件
    BASE_NAME=$(basename "$FILE_PATH")
    EXT="${BASE_NAME##*.}"
    if [[ "$EXT" == "svg" || "$EXT" == "csv" || "$EXT" == "log" ]]; then
        # 排除 10KB 以下的轻量级资源
        FILE_SIZE=0
        if [ -f "$FILE_PATH" ]; then
            FILE_SIZE=$(wc -c <"$FILE_PATH" | tr -d '[:space:]')
        fi
        if [ "$FILE_SIZE" -gt 10240 ]; then
            BLOCK_MSG=$'⛔ 上下文防污染：大体量原始资源文件（SVG/CSV/LOG）禁止直接在主上下文 Read 读取。\n   → 请委派子 Agent 进行结构提取和精简，避免污染主进程 token 空间。'
        fi
    fi
fi

# 动态校验并拦截由 guardrail compiler 自动编译进 config.json 的 preToolUseHooks 正则拦截规则
DYNAMIC_BLOCK_MSG=$(python3 -c "
import json, re, sys
config_path = sys.argv[1]
tool_name = sys.argv[2]
file_path = sys.argv[3]
command = sys.argv[4]
try:
    cfg = json.load(open(config_path))
    hooks = cfg.get('preToolUseHooks') or []
    for hook in hooks:
        pattern = hook.get('pattern')
        explanation = hook.get('explanation') or '命中自进化防错规则'
        if pattern:
            if re.search(pattern, command, re.IGNORECASE) or re.search(pattern, file_path, re.IGNORECASE):
                print('⛔ [自演进规则物理拦截] 命中了已编译防错正则规则：' + pattern + '\n   → 阻断原因：' + explanation)
                sys.exit(0)
except:
    pass
" "$CONFIG_PATH" "$TOOL_NAME" "$FILE_PATH" "$COMMAND" 2>/dev/null)

if [ ! -z "$DYNAMIC_BLOCK_MSG" ]; then
    BLOCK_MSG="$DYNAMIC_BLOCK_MSG"
fi

# 未命中任何规则，允许放行
if [ -z "$BLOCK_MSG" ]; then
    exit 0
fi

# ── Bypass 授权检查机制 ────────────────────────────────────
BYPASS_PATH="$WORKTREE_ROOT/.orch/ctx-bypass"
if [ -f "$BYPASS_PATH" ]; then
    REASON=$(cat "$BYPASS_PATH" 2>/dev/null)
    echo "" >&2
    echo "⚠️ 上下文门禁 bypass 已临时授权：$REASON" >&2
    echo "" >&2
    rm -f "$BYPASS_PATH"
    exit 0
fi

# ── 执行拦截阻断 ──────────────────────────────────────────────
echo "" >&2
echo "$BLOCK_MSG" >&2
echo "" >&2
exit 2
