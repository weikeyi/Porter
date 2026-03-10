/**
 * 配置持久化服务
 * 使用 electron-store 在本地保存用户上次的表单配置
 */
import Store from 'electron-store';

/** 持久化的配置字段 */
export interface SavedConfig {
    mainConfigPath: string;
    sourceRoot: string;
    targetRoot: string;
    operation: 'copy' | 'move' | 'delete';
    conflictStrategy: 'skip' | 'overwrite' | 'purge';
    ignoreCase: boolean;
    measureSize: boolean;
    discoverRangeSubRoot: boolean;
    discoveryMaxDepth: number;
}

const defaults: SavedConfig = {
    mainConfigPath: '',
    sourceRoot: '',
    targetRoot: '',
    operation: 'copy',
    conflictStrategy: 'skip',
    ignoreCase: true,
    measureSize: false,
    discoverRangeSubRoot: true,
    discoveryMaxDepth: 4,
};

// electron-store 继承 conf，但 TypeScript 在 CJS 上下文中可能无法正确解析 ESM 类型。
// 使用 any 绕过类型检查——运行时 API 完全正确。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store: any = new Store({
    name: 'porter-config',
    defaults,
});

/** 读取已保存的配置 */
export function getSavedConfig(): SavedConfig {
    return {
        mainConfigPath: store.get('mainConfigPath') ?? defaults.mainConfigPath,
        sourceRoot: store.get('sourceRoot') ?? defaults.sourceRoot,
        targetRoot: store.get('targetRoot') ?? defaults.targetRoot,
        operation: store.get('operation') ?? defaults.operation,
        conflictStrategy: store.get('conflictStrategy') ?? defaults.conflictStrategy,
        ignoreCase: store.get('ignoreCase') ?? defaults.ignoreCase,
        measureSize: store.get('measureSize') ?? defaults.measureSize,
        discoverRangeSubRoot: store.get('discoverRangeSubRoot') ?? defaults.discoverRangeSubRoot,
        discoveryMaxDepth: store.get('discoveryMaxDepth') ?? defaults.discoveryMaxDepth,
    };
}

/** 保存配置（支持部分更新） */
export function saveConfig(config: Partial<SavedConfig>): void {
    for (const [key, value] of Object.entries(config)) {
        if (key in defaults) {
            store.set(key, value);
        }
    }
}
