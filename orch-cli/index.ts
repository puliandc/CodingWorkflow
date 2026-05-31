/**
 * orch-cli 命令分发入口
 * 使用方式：tsx scripts/orch-cli/index.ts <subcommand> [flags]
 *
 * 所有子命令统一规范：
 *   - stdout 输出 JSON：{"ok":true, ...payload}
 *   - 失败时 stderr 写中文错误，进程退出码非 0
 *   - 支持 --dry-run 标志（打印将执行的命令但不真跑）
 */

/** 所有可用子命令 */
const COMMANDS: Record<string, string> = {
  'issue-link-sub':    '建立父子 issue 关系（GraphQL addSubIssue）',
  'project-status':    '设置 GitHub Project #2 看板 Status 字段',
  'project-priority':  '设置 GitHub Project #2 看板 Priority 字段',
  'branch-create':     '创建 phase worktree 或 phase 内 sub 分支并 push（含 kebab 校验）',
  'state-init':        '初始化 Phase 级 .orch/phases/phase-<issue>.json 进度文件',
  'state-advance':     '更新进度文件中某 sub-issue 的状态字段',
  'state-next':        '读取进度文件，返回下一步路由建议（JSON）',
  'pr-check-merged':   '查询指定 PR 的合并状态（merged/open/closed）',
  'pr-create-sub':     '为 sub-issue 创建 PR（含中文 body 模板，含 docs 提交校验）',
  'pr-create-phase':   '为 Phase 整体创建 PR（base: main）',
  'commit-docs':       '提交 sub-issue 当前阶段文档（B：三文件 / D：验收报告）并推送',
  'worktree-remove':   '清理 Phase 的本地 worktree 与分支（Phase PR 合并后调用）',
  'gate':              '执行 lint/format/test 并进行真绿/伪绿三硬判定',
  'precheck':          '进行编码前的契约三表与占位符确定性门禁校验',
};

/**
 * 打印帮助信息到 stderr
 */
function printHelp(): void {
  process.stderr.write('用法：tsx scripts/orch-cli/index.ts <subcommand> [flags]\n\n');
  process.stderr.write('可用子命令：\n');
  const maxLen = Math.max(...Object.keys(COMMANDS).map(k => k.length));
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    process.stderr.write(`  ${cmd.padEnd(maxLen + 2)} ${desc}\n`);
  }
  process.stderr.write('\n每个命令支持 --dry-run 标志（仅打印将执行的命令）\n');
}

/**
 * 主入口：解析子命令并派发
 */
async function main(): Promise<void> {
  const sub = process.argv[2];
  const rest = process.argv.slice(3);

  if (!sub || sub === '--help' || sub === '-h') {
    printHelp();
    process.exit(sub ? 0 : 1);
  }

  switch (sub) {
    case 'issue-link-sub': {
      const m = await import('./commands/issue-link-sub');
      m.run(rest);
      break;
    }
    case 'project-status': {
      const m = await import('./commands/project-status');
      m.run(rest);
      break;
    }
    case 'project-priority': {
      const m = await import('./commands/project-priority');
      m.run(rest);
      break;
    }
    case 'branch-create': {
      const m = await import('./commands/branch-create');
      m.run(rest);
      break;
    }
    case 'state-init': {
      const m = await import('./commands/state-init');
      m.run(rest);
      break;
    }
    case 'state-advance': {
      const m = await import('./commands/state-advance');
      m.run(rest);
      break;
    }
    case 'state-next': {
      const m = await import('./commands/state-next');
      m.run(rest);
      break;
    }
    case 'pr-check-merged': {
      const m = await import('./commands/pr-check-merged');
      m.run(rest);
      break;
    }
    case 'pr-create-sub': {
      const m = await import('./commands/pr-create-sub');
      m.run(rest);
      break;
    }
    case 'pr-create-phase': {
      const m = await import('./commands/pr-create-phase');
      m.run(rest);
      break;
    }
    case 'commit-docs': {
      const m = await import('./commands/commit-docs');
      m.run(rest);
      break;
    }
    case 'worktree-remove': {
      const m = await import('./commands/worktree-remove');
      m.run(rest);
      break;
    }
    case 'gate': {
      const m = await import('./commands/gate');
      m.run(rest);
      break;
    }
    case 'precheck': {
      const m = await import('./commands/precheck');
      m.run(rest);
      break;
    }
    default: {
      process.stderr.write(`未知子命令："${sub}"\n\n`);
      printHelp();
      process.exit(1);
    }
  }
}

main().catch(err => {
  process.stderr.write(`orch-cli 内部错误：${(err as Error).message}\n`);
  process.exit(1);
});
