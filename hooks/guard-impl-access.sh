#!/usr/bin/env bash
# PreToolUse hook: 实施门禁与白名单确定性拦截
# exit 0 = 允许, exit 2 = 阻断

INPUT=$(cat)

# 解析 tool_name, file_path 和 command (利用 Python shlex.quote 和 eval 实现极其健壮的参数导入)
eval "$(echo "$INPUT" | python3 -c "
import sys, json, shlex
try:
    data = json.load(sys.stdin)
    tool_name = data.get('tool_name') or ''
    ti = data.get('tool_input') or {}
    file_path = data.get('file_path') or ti.get('file_path') or ''
    command = data.get('command') or ti.get('command') or ''
    print(f'TOOL_NAME={shlex.quote(tool_name)}')
    print(f'FILE_PATH={shlex.quote(file_path)}')
    print(f'COMMAND={shlex.quote(command)}')
except Exception:
    print('TOOL_NAME=\"\"')
    print('FILE_PATH=\"\"')
    print('COMMAND=\"\"')
" 2>/dev/null)"

# Read 类工具始终放行
if [ "$TOOL_NAME" = "Read" ] || [ "$TOOL_NAME" = "view_file" ] || [ "$TOOL_NAME" = "list_dir" ] || [ "$TOOL_NAME" = "grep_search" ]; then
    exit 0
fi

# 获取工作区根
WORKTREE_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$WORKTREE_ROOT" ]; then
    exit 0
fi

# 核心安全兜底：无 .orch/config.json 代表当前项目未接入 orch，优雅 no-op 直接放行！
CONFIG_PATH="$WORKTREE_ROOT/.orch/config.json"
if [ ! -f "$CONFIG_PATH" ]; then
    exit 0
fi

# 检查当前是否已有 .precheck-done 标记文件
PRECHECK_FILE="$WORKTREE_ROOT/.precheck-done"

# 1. ── .precheck-done 不存在模式（编码前门禁拦截） ───────────────────────
if [ ! -f "$PRECHECK_FILE" ]; then
    # 从 config.json 中解析 whitelistEnforcePaths
    ENFORCE_PATHS=$(python3 -c "
import json, sys
try:
    cfg = json.load(open(sys.argv[1]))
    paths = cfg.get('whitelistEnforcePaths') or []
    print('\n'.join(paths))
except:
    pass
" "$CONFIG_PATH" 2>/dev/null)

    # 如果没有指定强制拦截路径，默认放行（避免误伤非开发阶段）
    if [ -z "$ENFORCE_PATHS" ]; then
        exit 0
    fi

    # 规范化要修改的相对路径
    if [[ "$FILE_PATH" == "$WORKTREE_ROOT/"* ]]; then
        REL_PATH="${FILE_PATH#$WORKTREE_ROOT/}"
    else
        REL_PATH="$FILE_PATH"
    fi

    # 阻断 Edit/Write 中试图修改 whitelistEnforcePaths 的越界操作
    if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "replace_file_content" ] || [ "$TOOL_NAME" = "multi_replace_file_content" ] || [ "$TOOL_NAME" = "write_to_file" ]; then
        for path in $ENFORCE_PATHS; do
            if [[ "$REL_PATH" == "$path"* ]]; then
                echo "" >&2
                echo "⛔ 实施门禁：未通过编码前 precheck 校验，禁止修改核心路径 $REL_PATH" >&2
                echo "   请先在主会话中完成 /orch B 阶段设计，解锁契约三表再继续。" >&2
                echo "" >&2
                exit 2
            fi
        done
    fi
    exit 0
fi

# 2. ── 有效契约模式：只对 Edit/Write 类写入操作做白名单拦截 ──────────────────
# 仅对核心写入工具进行校验
if [ "$TOOL_NAME" != "Edit" ] && [ "$TOOL_NAME" != "Write" ] && [ "$TOOL_NAME" != "replace_file_content" ] && [ "$TOOL_NAME" != "multi_replace_file_content" ] && [ "$TOOL_NAME" != "write_to_file" ]; then
    exit 0
fi

if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# 规范化为相对路径
if [[ "$FILE_PATH" == "$WORKTREE_ROOT/"* ]]; then
    REL_PATH="${FILE_PATH#$WORKTREE_ROOT/}"
else
    REL_PATH="$FILE_PATH"
fi

# 契约文件绝对路径
CONTRACT_PATH=$(cat "$PRECHECK_FILE" | tr -d '[:space:]')
if [ -z "$CONTRACT_PATH" ] || [ ! -f "$CONTRACT_PATH" ]; then
    # 契约文件丢失，fail-closed 阻断（marker 已存在代表进入受控编码期）
    echo "" >&2
    echo "⛔ 架构契约违规：.precheck-done 存在但其指向的契约文件丢失或为空！" >&2
    echo "   请重新运行 precheck 解锁白名单，确保契约文件物理存在后再继续编码。" >&2
    echo "" >&2
    exit 2
fi

# 从契约 arch.md 中安全解析文件白名单（强力解析兼容表格与 fenced block）
WHITELIST=$(python3 -c "
import re, sys
contract_path = sys.argv[1]
try:
    content = open(contract_path, encoding='utf-8').read()
except:
    sys.exit(1)

paths = []
# 1. 尝试解析标准的 [契约] 文件白名单 Markdown 表格
table_match = re.search(r'#### \[契约\] 文件白名单(.*?)(?=\n#### |\Z)', content, re.DOTALL)
if table_match:
    table_content = table_match.group(1)
    for line in table_content.strip().split('\n'):
        if '|' in line and not any(k in line for k in ['允许路径', '---', '允许的路径']):
            parts = [p.strip() for p in line.split('|')]
            if len(parts) > 1 and parts[1]:
                clean_path = parts[1].replace('\`', '').strip()
                if clean_path:
                    paths.append(clean_path)

# 2. 兜底兼容旧版 fenced code 块格式
if not paths:
    match = re.search(r'## 文件白名单(.*?)(?=\n## |\Z)', content, re.DOTALL)
    if match:
        section = match.group(1)
        for block in re.findall(r'\`\`\`\n(.*?)\`\`\`', section, re.DOTALL):
            for line in block.strip().split('\n'):
                line = line.strip()
                if line and not line.startswith('#'):
                    paths.append(line)

print('\n'.join(paths))
" "$CONTRACT_PATH" 2>/dev/null)

if [ -z "$WHITELIST" ]; then
    # 白名单为空或解析失败，fail-closed 阻断（marker 已存在代表进入受控编码期）
    echo "" >&2
    echo "⛔ 架构契约违规：白名单解析失败或结果为空！" >&2
    echo "   请检查 arch.md 中的「文件白名单」表格格式是否正确，并重新运行 precheck 解锁白名单。" >&2
    echo "" >&2
    exit 2
fi

# 检查当前相对路径是否在白名单列表内
if echo "$WHITELIST" | grep -qxF "$REL_PATH"; then
    exit 0
else
    echo "" >&2
    echo "⛔ 架构契约越界：试图修改白名单之外的文件 $REL_PATH" >&2
    echo "   本次 Phase 允许修改的文件仅限于：" >&2
    echo "$WHITELIST" | sed 's/^/   - /' >&2
    echo "   [质量纪律拦截] 请立即停手，触发「越界写入」停止条件上报用户裁决！" >&2
    echo "" >&2
    exit 2
fi
