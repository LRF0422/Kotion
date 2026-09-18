export const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes < 0) return '不限'
    if (bytes >= 1024 * 1024 * 1024) {
        const gb = bytes / (1024 * 1024 * 1024)
        return (gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)) + ' GB'
    }
    if (bytes >= 1024 * 1024) return Math.round(bytes / (1024 * 1024)) + ' MB'
    if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB'
    return bytes + ' B'
}

export const formatQuotaValue = (value: number, unit?: string): string => {
    if (value === -1) return '不限'
    if (unit === 'bytes') return formatBytes(value)
    if (unit && unit.indexOf('token') >= 0) {
        if (value >= 1000000) {
            const millions = value / 1000000
            return (millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)) + 'M'
        }
        if (value >= 1000) return Math.round(value / 1000) + 'k'
        return String(value)
    }
    return unit ? value + ' ' + unit : String(value)
}
