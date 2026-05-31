import { loadConfig } from './config';

// 声明导出类型，供 TypeScript 静态检查
export declare const REPO: string;
export declare const OWNER: string;
export declare const PROJECT_ID: string;
export declare const PROJECT_NUMBER: number;
export declare const STATUS_FIELD_ID: string;
export declare const PRIORITY_FIELD_ID: string;
export declare const STATUS_OPTIONS: Record<string, string>;
export declare const PRIORITY_OPTIONS: Record<string, string>;

/** 有效的 Status 选项 key 类型 */
export type StatusOption = string;

/** 有效的 Priority 选项 key 类型 */
export type PriorityOption = string;

// 运行时的动态获取逻辑
const constants = {
  get REPO(): string {
    return loadConfig().repo;
  },
  get OWNER(): string {
    return loadConfig().repo.split('/')[0];
  },
  get PROJECT_ID(): string {
    const proj = loadConfig().project;
    if (!proj?.id) {
      throw new Error('未在 .orch/config.json 中配置 project.id');
    }
    return proj.id;
  },
  get PROJECT_NUMBER(): number {
    return loadConfig().project?.number ?? 2;
  },
  get STATUS_FIELD_ID(): string {
    const proj = loadConfig().project;
    if (!proj?.statusFieldId) {
      throw new Error('未在 .orch/config.json 中配置 project.statusFieldId');
    }
    return proj.statusFieldId;
  },
  get PRIORITY_FIELD_ID(): string {
    const proj = loadConfig().project;
    if (!proj?.priorityFieldId) {
      throw new Error('未在 .orch/config.json 中配置 project.priorityFieldId');
    }
    return proj.priorityFieldId;
  },
  get STATUS_OPTIONS(): Record<string, string> {
    const proj = loadConfig().project;
    if (!proj?.statusOptions) {
      throw new Error('未在 .orch/config.json 中配置 project.statusOptions');
    }
    return proj.statusOptions;
  },
  get PRIORITY_OPTIONS(): Record<string, string> {
    return loadConfig().project?.priorityOptions ?? {
      'P0': 'c2020ee5',
      'P1': 'c3db6ac5',
      'P2': '5058738f',
    };
  }
};

// 动态将 properties 绑定到 CommonJS 的 exports 对象，实现运行时的活绑定
if (typeof exports !== 'undefined') {
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(constants))) {
    Object.defineProperty(exports, key, {
      ...descriptor,
      configurable: true,
      enumerable: true
    });
  }
}
