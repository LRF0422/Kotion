import React from 'react'
import { RotateCcw } from '@kn/icon'
import {
    Button,
    Input,
    Label,
    Popover,
    PopoverAnchor,
    PopoverContent,
    Slider,
} from '@kn/ui'
import { useTranslation } from '@kn/common'
import type { ChatModelParams } from '@kn/common'

// ─── Defaults / bounds ─────────────────────────────────────────────

/**
 * Backend defaults — kept in sync with `ChatCompletionRequest` on the server.
 * When a field is unset here the backend applies its own default.
 */
export const DEFAULT_TEMPERATURE = 0.7
const TEMPERATURE_MIN = 0
const TEMPERATURE_MAX = 2
const TEMPERATURE_STEP = 0.1

// Loose upper bound — the backend clamps this per model.
const MAX_TOKENS_UPPER = 32_768
const MAX_TOKENS_LOWER = 1

// ─── Props ─────────────────────────────────────────────────────────

/** Whether any sampling param diverges from the server defaults. */
export const isModelParamsCustomized = (params: ChatModelParams): boolean =>
    params.temperature !== undefined || params.maxTokens !== undefined

interface ModelParamsPopoverProps {
    params: ChatModelParams
    onChange: (params: ChatModelParams) => void
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Single element the popover anchors to (the model selector trigger). */
    children: React.ReactElement
}

/**
 * Sampling-params panel for chat requests. Owned by the model selector: the
 * dropdown's footer item opens this popover and the selector's trigger button
 * doubles as the anchor, so the composer toolbar needs no dedicated icon.
 */
export const ModelParamsPopover: React.FC<ModelParamsPopoverProps> = ({
    params,
    onChange,
    open,
    onOpenChange,
    children,
}) => {
    const { t } = useTranslation()

    const temperature = params.temperature ?? DEFAULT_TEMPERATURE
    const maxTokens = params.maxTokens

    const isCustomized = isModelParamsCustomized(params)

    const handleTemperatureChange = (value: number[]) => {
        const next = Number(value[0].toFixed(2))
        // Only persist explicit tweaks; going back to the default drops the field.
        if (next === DEFAULT_TEMPERATURE) {
            const { temperature: _t, ...rest } = params
            onChange(rest)
        } else {
            onChange({ ...params, temperature: next })
        }
    }

    const handleMaxTokensChange = (raw: string) => {
        const trimmed = raw.trim()
        if (trimmed === '') {
            const { maxTokens: _m, ...rest } = params
            onChange(rest)
            return
        }
        const n = Math.floor(Number(trimmed))
        if (!Number.isFinite(n) || n < MAX_TOKENS_LOWER) return
        onChange({ ...params, maxTokens: Math.min(n, MAX_TOKENS_UPPER) })
    }

    const handleReset = () => {
        onChange({})
    }

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverAnchor asChild>{children}</PopoverAnchor>
            <PopoverContent
                align="start"
                sideOffset={6}
                className="w-[260px] p-3 space-y-3"
            >
                <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold">
                        {t('ai.modelParams.title', { defaultValue: '模型参数' })}
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleReset}
                        disabled={!isCustomized}
                        className="h-6 px-1.5 gap-1 text-[10px] text-muted-foreground disabled:opacity-40"
                    >
                        <RotateCcw className="h-3 w-3" />
                        {t('ai.modelParams.reset', { defaultValue: '重置' })}
                    </Button>
                </div>

                {/* Temperature */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <Label className="text-[11px] font-medium">
                            {t('ai.modelParams.temperature', { defaultValue: '温度' })}
                        </Label>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                            {temperature.toFixed(2)}
                        </span>
                    </div>
                    <Slider
                        min={TEMPERATURE_MIN}
                        max={TEMPERATURE_MAX}
                        step={TEMPERATURE_STEP}
                        value={[temperature]}
                        onValueChange={handleTemperatureChange}
                    />
                    <p className="text-[10px] leading-snug text-muted-foreground">
                        {t('ai.modelParams.temperatureHint', { defaultValue: '越低越精确稳定，越高越有创造力' })}
                    </p>
                </div>

                {/* Max tokens */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <Label className="text-[11px] font-medium">
                            {t('ai.modelParams.maxTokens', { defaultValue: '最大 Tokens' })}
                        </Label>
                        <span className="text-[10px] text-muted-foreground">
                            {maxTokens == null
                                ? t('ai.modelParams.serverDefault', { defaultValue: '服务器默认' })
                                : maxTokens}
                        </span>
                    </div>
                    <Input
                        type="number"
                        inputMode="numeric"
                        min={MAX_TOKENS_LOWER}
                        max={MAX_TOKENS_UPPER}
                        step={1}
                        placeholder={t('ai.modelParams.maxTokensPlaceholder', { defaultValue: '如 4096' })}
                        value={maxTokens ?? ''}
                        onChange={(e) => handleMaxTokensChange(e.target.value)}
                        className="h-7 text-[11px]"
                    />
                    <p className="text-[10px] leading-snug text-muted-foreground">
                        {t('ai.modelParams.maxTokensHint', { defaultValue: '留空使用模型默认值，后端会限制到上下文窗口范围内' })}
                    </p>
                </div>
            </PopoverContent>
        </Popover>
    )
}
