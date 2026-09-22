import React, { useCallback, useEffect, useRef, useState } from "react"
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Baseline,
    Bold,
    Eraser,
    Hash,
    Italic,
    Merge,
    PaintBucket,
    Redo2,
    Square,
    Strikethrough,
    Table,
    Underline,
    Undo2,
    WrapText,
} from "@kn/icon"
import {
    Button,
    ColorPicker,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
    Toggle,
    ToggleGroup,
    ToggleGroupItem,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    cn,
} from "@kn/ui"
import type { GridApi } from "./grid-api"
import type { NumberFormatKind } from "./workbook-data"
import { translate } from "../i18n"

/**
 * Spreadsheet toolbar.
 *
 * Built entirely from the shared @kn/ui primitives (Button / Toggle / Select /
 * DropdownMenu / ColorPicker / Tooltip) so it matches the rest of the app rather
 * than falling back to the browser's native controls. Everything is applied
 * through the grid's own style API, so the result persists with the document.
 */

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24]
const NUMBER_FORMATS: { value: NumberFormatKind; key: string }[] = [
    { value: 'general', key: 'numberGeneral' },
    { value: 'decimal', key: 'numberDecimal' },
    { value: 'percent', key: 'numberPercent' },
    { value: 'currency', key: 'numberCurrency' },
]
const BORDER_COLOURS: { key: string; value: string }[] = [
    { key: 'borderAuto', value: 'auto' },
    { key: 'borderBlack', value: '#000000' },
    { key: 'borderGrey', value: '#9ca3af' },
    { key: 'borderBlue', value: '#2563eb' },
    { key: 'borderRed', value: '#dc2626' },
]
const ICON_CLASS = 'h-3.5 w-3.5'

interface ToolbarProps {
    grid: GridApi
    disabled?: boolean
    /** Bumped by the view whenever the selection may have changed. */
    refreshKey: number
    onImport: () => void
    onExport: () => void
    onFullscreen: () => void
    /** Opens the pivot-table dialog; omitted hides the button. */
    onCreatePivot?: () => void
    isFullscreen?: boolean
}

/** Icon-only ghost button in the compact toolbar, with a tooltip. */
const ToolbarButton: React.FC<{
    label: string
    disabled?: boolean
    active?: boolean
    onClick: () => void
    children: React.ReactNode
}> = ({ label, disabled, active, onClick, children }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', active && 'bg-accent text-accent-foreground')}
                disabled={disabled}
                aria-label={label}
                aria-pressed={active ? true : undefined}
                onClick={onClick}
            >
                {children}
            </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
)

/** Icon-only toggle in the compact toolbar, with a tooltip. */
const ToolbarToggle: React.FC<{
    label: string
    pressed?: boolean
    disabled?: boolean
    onPressedChange: (pressed: boolean) => void
    children: React.ReactNode
}> = ({ label, pressed, disabled, onPressedChange, children }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Toggle
                size="sm"
                pressed={pressed}
                disabled={disabled}
                onPressedChange={onPressedChange}
                aria-label={label}
                className="h-7 w-7 p-0"
            >
                {children}
            </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
)

/** Colour chip under the text/fill icons, reflecting the current cell value. */
const ColorIcon: React.FC<{ color?: string; children: React.ReactNode }> = ({ color, children }) => (
    <span className="inline-flex flex-col items-center gap-[1px]">
        <span style={{ color: color || 'currentColor' }}>{children}</span>
        <span
            className="h-[3px] w-4 rounded-[1px] border border-black/10 dark:border-white/20"
            style={{ backgroundColor: color || 'transparent' }}
        />
    </span>
)

export const SheetToolbar: React.FC<ToolbarProps> = React.memo(({
    grid,
    disabled,
    refreshKey,
    onImport,
    onExport,
    onFullscreen,
    onCreatePivot,
    isFullscreen,
}) => {
    const [style, setStyle] = useState<Record<string, string>>({})
    const [fontSize, setFontSize] = useState('')
    const t = translate

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

    const active = (property: string, value: string) => style[property] === value

    // 'text-decoration' is a single space-separated list, so underline and
    // strikethrough must be toggled inside it rather than overwriting each other.
    const setDecoration = useCallback((token: string, on: boolean) => {
        const current = (style['text-decoration'] ?? '').split(/\s+/).filter(Boolean)
        const next = on
            ? (current.includes(token) ? current : [...current, token])
            : current.filter((item) => item !== token)
        apply({ 'text-decoration': next.length > 0 ? next.join(' ') : null })
    }, [apply, style])

    const applyBorder = useCallback((colour: string) => {
        apply({ border: colour === 'auto' ? null : '1px solid ' + colour })
    }, [apply])

    const applyNumberFormat = useCallback((format: NumberFormatKind) => {
        grid.applyNumberFormat(format)
        // Numbers read better right-aligned, like Excel.
        if (format !== 'general') apply({ 'text-align': 'right' })
    }, [apply, grid])

    // Colour pickers emit on every pointer move, so remember the latest colour
    // and commit it once when the popover closes. Applying per move would flood
    // the grid's undo history (one entry per cell per move).
    const pendingColourRef = useRef<{ property: 'color' | 'background-color'; value: string } | null>(null)
    const commitColour = useCallback((property: 'color' | 'background-color') => {
        const pending = pendingColourRef.current
        if (pending && pending.property === property) {
            pendingColourRef.current = null
            apply({ [property]: pending.value })
        }
    }, [apply])

    const alignValue = style['text-align'] ?? ''
    // A document may carry a font size that is not in the preset list (imported
    // sheets do). Keep it selectable so the trigger always has a matching item.
    const sizeOptions = fontSize && !FONT_SIZES.includes(Number(fontSize))
        ? [...FONT_SIZES, Number(fontSize)].sort((a, b) => a - b)
        : FONT_SIZES

    return (
        <TooltipProvider delayDuration={300}>
            <div className="kn-sheet__toolbar" role="toolbar" aria-label={t('spreadsheet.title')}>
                <ToolbarButton label={t('spreadsheet.toolbar.undo')} disabled={disabled} onClick={() => grid.undo()}>
                    <Undo2 className={ICON_CLASS} />
                </ToolbarButton>
                <ToolbarButton label={t('spreadsheet.toolbar.redo')} disabled={disabled} onClick={() => grid.redo()}>
                    <Redo2 className={ICON_CLASS} />
                </ToolbarButton>

                <Separator orientation="vertical" className="mx-0.5 h-5" />

                <Select
                    value={fontSize || 'default'}
                    onValueChange={(value) => {
                        const next = value === 'default' ? '' : value
                        setFontSize(next)
                        apply({ 'font-size': next ? next + 'px' : null })
                    }}
                    disabled={disabled}
                >
                    <SelectTrigger
                        className="h-7 w-[70px] text-xs"
                        title={t('spreadsheet.toolbar.fontSize')}
                        aria-label={t('spreadsheet.toolbar.fontSize')}
                    >
                        <SelectValue placeholder={t('spreadsheet.toolbar.fontSize')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default" className="text-xs">{t('spreadsheet.toolbar.fontSize')}</SelectItem>
                        {sizeOptions.map((size) => (
                            <SelectItem key={size} value={String(size)} className="text-xs">{size}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <ToolbarToggle
                    label={t('spreadsheet.toolbar.bold')}
                    pressed={active('font-weight', 'bold')}
                    disabled={disabled}
                    onPressedChange={(pressed) => apply({ 'font-weight': pressed ? 'bold' : null })}
                >
                    <Bold className={ICON_CLASS} />
                </ToolbarToggle>
                <ToolbarToggle
                    label={t('spreadsheet.toolbar.italic')}
                    pressed={active('font-style', 'italic')}
                    disabled={disabled}
                    onPressedChange={(pressed) => apply({ 'font-style': pressed ? 'italic' : null })}
                >
                    <Italic className={ICON_CLASS} />
                </ToolbarToggle>
                <ToolbarToggle
                    label={t('spreadsheet.toolbar.underline')}
                    pressed={(style['text-decoration'] ?? '').includes('underline')}
                    disabled={disabled}
                    onPressedChange={(pressed) => setDecoration('underline', pressed)}
                >
                    <Underline className={ICON_CLASS} />
                </ToolbarToggle>
                <ToolbarToggle
                    label={t('spreadsheet.toolbar.strikethrough')}
                    pressed={(style['text-decoration'] ?? '').includes('line-through')}
                    disabled={disabled}
                    onPressedChange={(pressed) => setDecoration('line-through', pressed)}
                >
                    <Strikethrough className={ICON_CLASS} />
                </ToolbarToggle>

                <Separator orientation="vertical" className="mx-0.5 h-5" />

                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex">
                            <ColorPicker
                                value={style.color}
                                trigger="toggle"
                                triggerIcon={<ColorIcon color={style.color}><Baseline className={ICON_CLASS} /></ColorIcon>}
                                triggerAriaLabel={t('spreadsheet.toolbar.textColor')}
                                triggerClassName="h-7 w-7 p-0"
                                align="start"
                                disabled={disabled}
                                onChange={(color) => { pendingColourRef.current = { property: 'color', value: color } }}
                                onOpenChange={(open) => { if (!open) commitColour('color') }}
                                onUnset={() => { pendingColourRef.current = null; apply({ color: null }) }}
                            />
                        </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('spreadsheet.toolbar.textColor')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="inline-flex">
                            <ColorPicker
                                value={style['background-color']}
                                trigger="toggle"
                                triggerIcon={<ColorIcon color={style['background-color']}><PaintBucket className={ICON_CLASS} /></ColorIcon>}
                                triggerAriaLabel={t('spreadsheet.toolbar.fillColor')}
                                triggerClassName="h-7 w-7 p-0"
                                align="start"
                                disabled={disabled}
                                onChange={(color) => { pendingColourRef.current = { property: 'background-color', value: color } }}
                                onOpenChange={(open) => { if (!open) commitColour('background-color') }}
                                onUnset={() => { pendingColourRef.current = null; apply({ 'background-color': null }) }}
                            />
                        </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t('spreadsheet.toolbar.fillColor')}</TooltipContent>
                </Tooltip>

                <Separator orientation="vertical" className="mx-0.5 h-5" />

                <ToggleGroup
                    type="single"
                    value={alignValue}
                    onValueChange={(value: string) => { if (value) apply({ 'text-align': value }) }}
                    disabled={disabled}
                    className="gap-0"
                >
                    {([
                        { value: 'left', label: t('spreadsheet.toolbar.alignLeft'), icon: <AlignLeft className={ICON_CLASS} /> },
                        { value: 'center', label: t('spreadsheet.toolbar.alignCenter'), icon: <AlignCenter className={ICON_CLASS} /> },
                        { value: 'right', label: t('spreadsheet.toolbar.alignRight'), icon: <AlignRight className={ICON_CLASS} /> },
                    ] as const).map((item) => (
                        <Tooltip key={item.value}>
                            <TooltipTrigger asChild>
                                <ToggleGroupItem
                                    value={item.value}
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    aria-label={item.label}
                                >
                                    {item.icon}
                                </ToggleGroupItem>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">{item.label}</TooltipContent>
                        </Tooltip>
                    ))}
                </ToggleGroup>
                <ToolbarToggle
                    label={t('spreadsheet.toolbar.wrap')}
                    pressed={active('white-space', 'pre-wrap')}
                    disabled={disabled}
                    onPressedChange={(pressed) => apply({ 'white-space': pressed ? 'pre-wrap' : null })}
                >
                    <WrapText className={ICON_CLASS} />
                </ToolbarToggle>

                <Separator orientation="vertical" className="mx-0.5 h-5" />

                <ToolbarButton label={t('spreadsheet.toolbar.merge')} disabled={disabled} onClick={() => grid.toggleMerge()}>
                    <Merge className={ICON_CLASS} />
                </ToolbarButton>
                {onCreatePivot && (
                    <ToolbarButton label={t('spreadsheet.pivot.create')} disabled={disabled} onClick={onCreatePivot}>
                        <Table className={ICON_CLASS} />
                    </ToolbarButton>
                )}

                <DropdownMenu>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild disabled={disabled}>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={disabled}
                                    aria-label={t('spreadsheet.toolbar.numberFormat')}
                                >
                                    <Hash className={ICON_CLASS} />
                                </Button>
                            </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{t('spreadsheet.toolbar.numberFormat')}</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="start" className="min-w-[160px]">
                        {NUMBER_FORMATS.map((item) => (
                            <DropdownMenuItem
                                key={item.value}
                                className="text-xs"
                                onSelect={() => applyNumberFormat(item.value)}
                            >
                                {t('spreadsheet.toolbar.' + item.key)}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild disabled={disabled}>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={disabled}
                                    aria-label={t('spreadsheet.toolbar.border')}
                                >
                                    <Square className={ICON_CLASS} />
                                </Button>
                            </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{t('spreadsheet.toolbar.border')}</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="start" className="min-w-[140px]">
                        {BORDER_COLOURS.map((option) => (
                            <DropdownMenuItem
                                key={option.key}
                                className="gap-2 text-xs"
                                onSelect={() => applyBorder(option.value)}
                            >
                                <span
                                    className="h-3 w-3 rounded-[3px] border border-black/10 dark:border-white/20"
                                    style={{ backgroundColor: option.value === 'auto' ? 'transparent' : option.value }}
                                />
                                {t('spreadsheet.toolbar.' + option.key)}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <ToolbarButton
                    label={t('spreadsheet.toolbar.clearFormat')}
                    disabled={disabled}
                    onClick={() => apply({
                        'font-weight': null,
                        'font-style': null,
                        'text-decoration': null,
                        color: null,
                        'background-color': null,
                        'text-align': null,
                        'white-space': null,
                        border: null,
                        'font-size': null,
                    })}
                >
                    <Eraser className={ICON_CLASS} />
                </ToolbarButton>

                <Separator orientation="vertical" className="mx-0.5 h-5" />

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={onImport}
                >
                    {t('spreadsheet.toolbar.import')}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={onExport}
                    title={t('spreadsheet.exportTooltip')}
                >
                    {t('spreadsheet.toolbar.export')}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={onFullscreen}
                >
                    {isFullscreen ? t('spreadsheet.toolbar.exitFullscreen') : t('spreadsheet.toolbar.fullscreen')}
                </Button>
            </div>
        </TooltipProvider>
    )
})
SheetToolbar.displayName = 'SheetToolbar'
