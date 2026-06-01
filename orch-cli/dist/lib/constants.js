"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
// 运行时的动态获取逻辑
const constants = {
    get REPO() {
        return (0, config_1.loadConfig)().repo;
    },
    get OWNER() {
        return (0, config_1.loadConfig)().repo.split('/')[0];
    },
    get PROJECT_ID() {
        const proj = (0, config_1.loadConfig)().project;
        if (!proj?.id) {
            throw new Error('未在 .orch/config.json 中配置 project.id');
        }
        return proj.id;
    },
    get PROJECT_NUMBER() {
        return (0, config_1.loadConfig)().project?.number ?? 2;
    },
    get STATUS_FIELD_ID() {
        const proj = (0, config_1.loadConfig)().project;
        if (!proj?.statusFieldId) {
            throw new Error('未在 .orch/config.json 中配置 project.statusFieldId');
        }
        return proj.statusFieldId;
    },
    get PRIORITY_FIELD_ID() {
        const proj = (0, config_1.loadConfig)().project;
        if (!proj?.priorityFieldId) {
            throw new Error('未在 .orch/config.json 中配置 project.priorityFieldId');
        }
        return proj.priorityFieldId;
    },
    get STATUS_OPTIONS() {
        const proj = (0, config_1.loadConfig)().project;
        if (!proj?.statusOptions) {
            throw new Error('未在 .orch/config.json 中配置 project.statusOptions');
        }
        return proj.statusOptions;
    },
    get PRIORITY_OPTIONS() {
        return (0, config_1.loadConfig)().project?.priorityOptions ?? {
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
