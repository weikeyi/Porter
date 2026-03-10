/**
 * 通用格式化工具函数
 * 从 App.vue 提取，供多个组件复用
 */

/** 格式化字节数为人类可读的单位 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const exponent = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1
    )
    const value = bytes / 1024 ** exponent
    return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

/** 格式化传输速度 */
export function formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond === 0) return '0 B/s'
    return formatBytes(bytesPerSecond) + '/s'
}

/** 格式化剩余时间 */
export function formatTime(seconds?: number): string {
    if (!seconds || seconds < 0) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}分${secs}秒`
}

/** 截断路径预览，保留尾部 */
export function formatPathPreview(value: string, maxLength = 42): string {
    if (value.length <= maxLength) {
        return value
    }
    const tailLength = Math.max(18, maxLength - 4)
    return `...${value.slice(-tailLength)}`
}

/** 扫描状态的中文标签 */
export function statusLabel(status: 'missing' | 'exists' | 'duplicate'): string {
    switch (status) {
        case 'missing':
            return '缺失'
        case 'exists':
            return '已匹配'
        case 'duplicate':
            return '重复'
    }
}

/** 格式化错误信息 */
export function formatError(error: unknown): string {
    if (error instanceof Error) {
        return `错误: ${error.message}`
    }
    return '发生未知错误'
}
