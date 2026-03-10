/** Default height for the spreadsheet block (pixels) */
export const DEFAULT_SPREADSHEET_HEIGHT = 560

/** Throttle interval for saving workbook data to node attributes (ms) */
export const SAVE_THROTTLE_MS = 2000

/** 大数据量优化配置 */
export const LARGE_DATA_CONFIG = {
    /** 虚拟滚动 overscan 行数 */
    rowOverscan: 20,
    /** 虚拟滚动 overscan 列数 */
    colOverscan: 10,
    /** 最大缓存行数 */
    maxCacheRows: 500,
    /** 单元格渲染阈值，超过则使用虚拟滚动 */
    virtualScrollThreshold: 10000,
}
