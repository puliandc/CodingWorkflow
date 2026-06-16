"use strict";
/**
 * orch-cli 命令分发入口
 * 使用方式：node orch-cli/dist/index.js <subcommand> [flags]
 *
 * 所有子命令统一规范：
 *   - stdout 输出 JSON：{"ok":true, ...payload}
 *   - 失败时 stderr 写中文错误，进程退出码非 0
 *   - 支持 --dry-run 标志（打印将执行的命令但不真跑）
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
/** 所有可用子命令 */
const COMMANDS = {
    'issue-link-sub': '建立父子 issue 关系（GraphQL addSubIssue）',
    'project-status': '设置 GitHub Project #2 看板 Status 字段',
    'project-priority': '设置 GitHub Project #2 看板 Priority 字段',
    'branch-create': '创建 phase worktree 或 phase 内 sub 分支并 push（含 kebab 校验）',
    'state-init': '初始化 Phase 级 .orch/phases/phase-<issue>.json 进度文件',
    'state-advance': '更新进度文件中某 sub-issue 的状态字段',
    'state-next': '读取进度文件，返回下一步路由建议（JSON）',
    'pr-check-merged': '查询指定 PR 的合并状态（merged/open/closed）',
    'pr-create-sub': '为 sub-issue 创建 PR（含中文 body 模板，含 docs 提交校验）',
    'pr-create-phase': '为 Phase 整体创建 PR（base: main）',
    'commit-docs': '提交 sub-issue 当前阶段文档（B：三文件 / D：验收报告）并推送',
    'worktree-remove': '清理 Phase 的本地 worktree 与分支（Phase PR 合并后调用）',
    'gate': '执行 lint/format/test 并进行真绿/伪绿三硬判定',
    'debug-comment': '将 Debug 诊断报告评论到当前 sub-issue',
    'debug-clean-check': '检查源码中是否仍残留 Debug 临时日志标记',
    'debug-allow-temp-log': '登记 Debug 临时日志白名单外写入授权',
    'precheck': '进行编码前的契约三表与占位符确定性门禁校验',
    'intake-check': '校验 intake.md 需求入口准入合规度',
    'contract-register': '登记 sub-issue 契约白名单和冻结表至全局看板',
    'contract-check': '跨分支碰撞校验当前 sub-issue 与全局并发契约的冲突',
    'chaos-gate': '审计并门禁混沌红蓝对抗验证报告（docs/test/chaos-report.md）',
    'release-check': '审计生产部署与一键回退 Runbook（docs/release/release-plan.md）',
    'guardrail-compile': '读取 retro.md 编译防错候选配置与钩子 Diffs',
    'post-merge': '交付后自动核验与闭环清理（含健康 Ping 与 issue 关闭）',
    'telemetry-webhook': 'APM 遥测 Webhook 异常回流物理拉起 Hotfix Issue 闭环',
    'telemetry-backfill': 'APM 遥测异常特征物理自愈回灌至回归护栏契约表',
};
/**
 * 打印帮助信息到 stderr
 */
function printHelp() {
    process.stderr.write('用法：node orch-cli/dist/index.js <subcommand> [flags]\n\n');
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
async function main() {
    const sub = process.argv[2];
    const rest = process.argv.slice(3);
    if (!sub || sub === '--help' || sub === '-h') {
        printHelp();
        process.exit(sub ? 0 : 1);
    }
    switch (sub) {
        case 'issue-link-sub': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/issue-link-sub')));
            m.run(rest);
            break;
        }
        case 'project-status': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/project-status')));
            m.run(rest);
            break;
        }
        case 'project-priority': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/project-priority')));
            m.run(rest);
            break;
        }
        case 'branch-create': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/branch-create')));
            m.run(rest);
            break;
        }
        case 'state-init': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/state-init')));
            m.run(rest);
            break;
        }
        case 'state-advance': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/state-advance')));
            m.run(rest);
            break;
        }
        case 'state-next': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/state-next')));
            m.run(rest);
            break;
        }
        case 'pr-check-merged': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/pr-check-merged')));
            m.run(rest);
            break;
        }
        case 'pr-create-sub': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/pr-create-sub')));
            m.run(rest);
            break;
        }
        case 'pr-create-phase': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/pr-create-phase')));
            m.run(rest);
            break;
        }
        case 'commit-docs': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/commit-docs')));
            m.run(rest);
            break;
        }
        case 'worktree-remove': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/worktree-remove')));
            m.run(rest);
            break;
        }
        case 'gate': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/gate')));
            m.run(rest);
            break;
        }
        case 'debug-comment': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/debug-comment')));
            m.run(rest);
            break;
        }
        case 'debug-clean-check': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/debug-clean-check')));
            m.run(rest);
            break;
        }
        case 'debug-allow-temp-log': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/debug-allow-temp-log')));
            m.run(rest);
            break;
        }
        case 'precheck': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/precheck')));
            m.run(rest);
            break;
        }
        case 'intake-check': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/intake-check')));
            m.run(rest);
            break;
        }
        case 'contract-register': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/contract-register')));
            m.run(rest);
            break;
        }
        case 'contract-check': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/contract-check')));
            m.run(rest);
            break;
        }
        case 'chaos-gate': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/chaos-gate')));
            m.run(rest);
            break;
        }
        case 'release-check': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/release-check')));
            m.run(rest);
            break;
        }
        case 'guardrail-compile': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/guardrail-compile')));
            m.run(rest);
            break;
        }
        case 'post-merge': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/post-merge')));
            await m.run(rest);
            break;
        }
        case 'telemetry-webhook': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/telemetry-webhook')));
            m.run(rest);
            break;
        }
        case 'telemetry-backfill': {
            const m = await Promise.resolve().then(() => __importStar(require('./commands/telemetry-backfill')));
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
    process.stderr.write(`orch-cli 内部错误：${err.message}\n`);
    process.exit(1);
});
