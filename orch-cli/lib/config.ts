import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { mainRepoRoot } from './state';

export interface ProjectConfig {
  repo: string;
  baseBranch: string;
  project?: {
    id: string;
    number?: number;
    statusFieldId?: string;
    statusOptions?: Record<string, string>;
    priorityFieldId?: string;
    priorityOptions?: Record<string, string>;
  };
  worktreeDir?: string;
  docsDir?: string;
  moduleLabels?: string[];
  commitTypes?: string[];
  whitelistEnforcePaths?: string[];
  commands?: {
    lint?: string;
    format?: string;
    test?: string;
    build?: string;
  };
  greenVerdict?: {
    successString?: string;
    errorKeywords?: string[];
  };
  workflowGates?: {
    intake?: 'block' | 'warn' | 'off';
    probing?: 'block' | 'warn' | 'off';
    adr?: 'block' | 'warn' | 'off';
    contractCollision?: 'block' | 'warn' | 'off';
    chaos?: 'block' | 'warn' | 'off';
    release?: 'block' | 'warn' | 'off';
    guardrailCompile?: 'block' | 'warn' | 'off';
  };
  contractRegistry?: {
    path?: string;
    conflictStrategy?: 'block' | 'warn' | 'off';
  };
  observability?: {
    specFile?: string;
    metricsUrl?: string;
    hotfixTemplate?: string;
  };
  guardrailCompiler?: {
    allowAutoRewrite?: boolean;
    targetConfigs?: string[];
  };
  migrationCheck?: boolean;
  linkNodeModules?: boolean;
  retro?: {
    enabled?: boolean;
  };
  largeFileExtensions?: string[];
}

let loadedConfig: ProjectConfig | null = null;

/**
 * 加载并缓存当前项目的 .orch/config.json 专属配置
 */
export function loadConfig(): ProjectConfig {
  if (loadedConfig) return loadedConfig;

  const root = mainRepoRoot();
  const configPath = resolve(root, '.orch', 'config.json');

  if (!existsSync(configPath)) {
    throw new Error(`项目配置文件不存在：${configPath}\n请在项目根目录创建 .orch/config.json 配置文件。`);
  }

  try {
    const raw = readFileSync(configPath, 'utf8');
    loadedConfig = JSON.parse(raw) as ProjectConfig;
    validateConfig(loadedConfig);
    return loadedConfig;
  } catch (err) {
    throw new Error(`无法读取或解析项目配置 ${configPath}：${(err as Error).message}`);
  }
}

function validateConfig(config: ProjectConfig): void {
  if (!config.repo) {
    throw new Error('配置错误：缺少 repo 参数（"owner/name"）');
  }
  if (!config.baseBranch) {
    throw new Error('配置错误：缺少 baseBranch 参数（"origin/main"）');
  }
}
