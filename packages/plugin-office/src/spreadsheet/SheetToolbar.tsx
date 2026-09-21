import React, { useCallback, useEffect, useState } from "react"
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Baseline,
    Bold,
    Eraser,
    Italic,
    Merge,
    PaintBucket,
    Redo2,
    Strikethrough,
    Underline,
    Undo2,
    WrapText,
} from "@kn/icon"
import type { GridApi } from "./useJspreadsheet"

/**
 * Compact toolbar covering the spreadsheet actions people actually use: history,
 * text emphasis, alignment/wrapping, basic number formats, borders, merge and
 * clearing formatting. Everything is applied through the grid's own style API,
 * so the result persists with the document.
 */

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24]
const BORDER_COLOURS = [
    { label: '自动', value: null },
    { label: '黑色', value: '#000000' },
    { label: '灰色', value: '#9ca3af' },
    { label: '蓝色', value: '#2563eb' },
    { label: '红色', value: '#dc2626' },
]

interface ToolbarProps {
    grid: GridApi
    disabled?: boolean
    /** Bumped by the view whenever the selection may have changed. */
    refreshKey: number
    onImport: () => void
    onExport: () => void
    onFullscreen: () => void
    isFullscreen?: boolean
}

/** A toolbar button that carries an on/off state. */
const ToolButton: React.FC<{
    title: string
    active?: boolean
    disabled?: boolean
    onClick: () => void
    children: React.ReactNode
}> = ({ title, active, disabled, onClick, children }) => (
    <button
        type="button"
        className="kn-sheet__btn"
        title={title}
        data-active={active ? 'true' : undefined}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
    >
        {children}
    </button>
)

export const SheetToolbar: React.FC<ToolbarProps> = React.memo(({
    grid,
    disabled,
    refreshKey,
    onImport,
    onExport,
    onFullscreen,
    isFullscreen,
}) => {
    const [style, setStyle] = useState<Record<string, string>>({})
    const [fontSize, setFontSize] = useState('')
    const [borderColour, setBorderColour] = useState<string | null>(null)

    // Re-read the anchor cell's style whenever the selection changes.
    useEffect(() => {
        if (disabled) return
        const next = grid.getSelectionStyle()
        setStyle(next)
        setFontSize(next['font-size'] ? String(parseInt(next['font-size'], 10)) : '')
    }, [grid, refreshKey, disabled])

    const apply = useCallback((declarations: Record<string, string | null>) => {
        if (disabled) return
        grid.applyStyle(declarations)
    }, [grid, disabled])

    /** Toggle a property on the selection based on the anchor's current style. */
    const toggle = useCallback((property: string, on: string, off: string | null) => {
        const current = style[property]
        apply({ [property]: current === on ? off : on })
    }, [apply, style])

    const active = (property: string, value: string) => style[property] === value

    const applyBorder = useCallback((colour: string | null) => {
        if (!colour) apply({ border: null })
        else apply({ border: `1px solid ${colour}` })
    }, [apply])

    const setNumberFormat = useCallback((format: string) => {
        if (!format) return
        grid.applyNumberFormat(format as 'general' | 'decimal' | 'percent' | 'currency')
        // Numbers read better right-aligned, like Excel.
        if (format !== 'general') apply({ 'text-align': 'right' })
    }, [apply, grid])

    return (
        <div className="kn-sheet__toolbar" role="toolbar" aria-label="Spreadsheet">
            <ToolButton title="撤销 (Ctrl+Z)" disabled={disabled} onClick={() => grid.undo()}>
                <Undo2 className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton title="重做 (Ctrl+Shift+Z)" disabled={disabled} onClick={() => grid.redo()}>
                <Redo2 className="h-3.5 w-3.5" />
            </ToolButton>

            <span className="kn-sheet__sep" aria-hidden="true" />

            <select
                className="kn-sheet__select"
                title="字号"
                disabled={disabled}
                value={fontSize}
                onChange={(e) => {
                    const value = e.target.value
                    setFontSize(value)
                    apply({ 'font-size': value ? `${value}px` : null })
                }}
            >
                <option value="">字号</option>
                {FONT_SIZES.map((size) => (
                    <option key={size} value={size}>{size}</option>
                ))}
            </select>

            <ToolButton title="加粗 (Ctrl+B)" active={active('font-weight', 'bold')} disabled={disabled} onClick={() => toggle('font-weight', 'bold', null)}>
                <Bold className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton title="斜体 (Ctrl+I)" active={active('font-style', 'italic')} disabled={disabled} onClick={() => toggle('font-style', 'italic', null)}>
                <Italic className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton title="下划线 (Ctrl+U)" active={active('text-decoration', 'underline')} disabled={disabled} onClick={() => toggle('text-decoration', 'underline', null)}>
                <Underline className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton title="删除线" active={active('text-decoration', 'line-through')} disabled={disabled} onClick={() => toggle('text-decoration', 'line-through', null)}>
                <Strikethrough className="h-3.5 w-3.5" />
            </ToolButton>

            <span className="kn-sheet__sep" aria-hidden="true" />

            <label className="kn-sheet__btn kn-sheet__swatch" title="文字颜色">
                <span style={{ color: style.color ?? 'currentColor' }}>
                    <Baseline className="h-3.5 w-3.5" />
                </span>
                <input
                    type="color"
                    disabled={disabled}
                    value={style.color ?? '#37352f'}
                    onChange={(e) => apply({ color: e.target.value })}
                />
            </label>
            <label className="kn-sheet__btn kn-sheet__swatch" title="填充颜色">
                <span style={{ color: style['background-color'] ?? 'currentColor' }}>
                    <PaintBucket className="h-3.5 w-3.5" />
                </span>
                <input
                    type="color"
                    disabled={disabled}
                    value={style['background-color'] ?? '#fef08a'}
                    onChange={(e) => apply({ 'background-color': e.target.value })}
                />
            </label>

            <span className="kn-sheet__sep" aria-hidden="true" />

            <ToolButton title="左对齐" active={active('text-align', 'left')} disabled={disabled} onClick={() => apply({ 'text-align': 'left' })}>
                <AlignLeft className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton title="居中" active={active('text-align', 'center')} disabled={disabled} onClick={() => apply({ 'text-align': 'center' })}>
                <AlignCenter className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton title="右对齐" active={active('text-align', 'right')} disabled={disabled} onClick={() => apply({ 'text-align': 'right' })}>
                <AlignRight className="h-3.5 w-3.5" />
            </ToolButton>
            <ToolButton title="自动换行" active={active('white-space', 'pre-wrap')} disabled={disabled} onClick={() => toggle('white-space', 'pre-wrap', null)}>
                <WrapText className="h-3.5 w-3.5" />
            </ToolButton>

            <span className="kn-sheet__sep" aria-hidden="true" />

            <ToolButton title="合并 / 取消合并" disabled={disabled} onClick={() => grid.toggleMerge()}>
                <Merge className="h-3.5 w-3.5" />
            </ToolButton>
            <select
                className="kn-sheet__select"
                title="数字格式"
                disabled={disabled}
                value=""
                onChange={(e) => {
                    setNumberFormat(e.target.value)
                    e.target.value = ''
                }}
            >
                <option value="">数字格式</option>
                <option value="text">常规</option>
                <option value="decimal">数字（两位小数）</option>
                <option value="percent">百分比</option>
                <option value="currency">货币</option>
            </select>
            <select
                className="kn-sheet__select"
                title="边框"
                disabled={disabled}
                value={borderColour ?? ''}
                onChange={(e) => {
                    const value = e.target.value || null
                    setBorderColour(value)
                    applyBorder(value)
                }}
            >
                {BORDER_COLOURS.map((option) => (
                    <option key={option.label} value={option.value ?? ''}>{option.label}</option>
                ))}
            </select>

            <ToolButton title="清除格式" disabled={disabled} onClick={() => apply({
                'font-weight': null,
                'font-style': null,
                'text-decoration': null,
                color: null,
                'background-color': null,
                'text-align': null,
                'white-space': null,
                border: null,
                'font-size': null,
            })}>
                <Eraser className="h-3.5 w-3.5" />
            </ToolButton>

            <span className="kn-sheet__sep" aria-hidden="true" />

            <button type="button" className="kn-sheet__btn" title="导入 Excel" onClick={onImport}>导入</button>
            <button type="button" className="kn-sheet__btn" title="导出为 .xlsx" onClick={onExport}>导出</button>
            <button
                type="button"
                className="kn-sheet__btn"
                title={isFullscreen ? '退出全屏' : '全屏'}
                onClick={onFullscreen}
            >
                {isFullscreen ? '退出' : '全屏'}
            </button>
        </div>
    )
})
SheetToolbar.displayName = 'SheetToolbar'
