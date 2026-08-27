import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, SlidersHorizontal, Sparkles } from '@kn/icon'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@kn/ui'
import {
    DEFAULT_MODEL,
    fetchModels,
    useTranslation,
    type ChatModelParams,
    type ModelInfo,
} from '@kn/common'

import { ModelParamsPopover, isModelParamsCustomized } from '../menu/chat/ModelParamsPopover'

const DEFAULT_VALUE = '__backend_default__'

type ModelSelectorDensity = 'compact' | 'comfortable'

export interface ModelSelectorProps {
    model: string
    onModelChange: (model: string) => void
    disabled?: boolean
    modelParams?: ChatModelParams
    onModelParamsChange?: (params: ChatModelParams) => void
    density?: ModelSelectorDensity
    triggerClassName?: string
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
    model,
    onModelChange,
    disabled,
    modelParams,
    onModelParamsChange,
    density = 'compact',
    triggerClassName = '',
}) => {
    const { t } = useTranslation()
    const [models, setModels] = useState<ModelInfo[]>([])
    const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'loaded'>('idle')
    const [open, setOpen] = useState(false)
    const [paramsOpen, setParamsOpen] = useState(false)

    useEffect(() => {
        if (!open || catalogState !== 'idle') return
        setCatalogState('loading')
        fetchModels().then((items) => {
            setModels(items)
            setCatalogState('loaded')
        })
    }, [catalogState, open])

    const grouped = useMemo(() => {
        const groups = new Map<string, ModelInfo[]>()
        for (const item of models) {
            const provider = item.provider || 'other'
            if (!groups.has(provider)) groups.set(provider, [])
            groups.get(provider)!.push(item)
        }
        return groups
    }, [models])

    const selectedModel = models.find((item) => item.id === model)
    const displayLabel = selectedModel?.name || model || DEFAULT_MODEL
    const hasUnknownSelection = !!model && catalogState === 'loaded' && !selectedModel
    const hasModelParams = modelParams !== undefined && onModelParamsChange !== undefined
    const paramsCustomized = modelParams ? isModelParamsCustomized(modelParams) : false
    const selectorLabel = t('ai.modelSelector.label', { defaultValue: '选择模型' })
    const densityClass = density === 'comfortable'
        ? 'lg:h-8 lg:px-2.5'
        : 'lg:h-7 lg:px-2'

    const trigger = (
        <DropdownMenuTrigger asChild disabled={disabled}>
            <button
                type="button"
                disabled={disabled}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                aria-label={`${selectorLabel}: ${displayLabel}`}
                title={displayLabel}
                className={`relative flex h-11 max-w-[180px] shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${densityClass} ${triggerClassName}`}
            >
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{displayLabel}</span>
                <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" />
                {paramsCustomized && (
                    <span
                        aria-hidden="true"
                        className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary"
                    />
                )}
            </button>
        </DropdownMenuTrigger>
    )

    return (
        <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
            {hasModelParams ? (
                <ModelParamsPopover
                    params={modelParams!}
                    onChange={onModelParamsChange!}
                    open={paramsOpen}
                    onOpenChange={setParamsOpen}
                >
                    {trigger}
                </ModelParamsPopover>
            ) : trigger}

            <DropdownMenuContent
                align="start"
                className="w-[240px] max-w-[calc(100vw-24px)] border-border/40"
            >
                <DropdownMenuRadioGroup
                    value={model || DEFAULT_VALUE}
                    onValueChange={(value) => onModelChange(value === DEFAULT_VALUE ? '' : value)}
                >
                    <DropdownMenuRadioItem value={DEFAULT_VALUE} className="min-h-11 lg:min-h-8">
                        <span className="truncate">
                            {t('ai.modelSelector.defaultOption', {
                                model: DEFAULT_MODEL,
                                defaultValue: `默认模型（${DEFAULT_MODEL}）`,
                            })}
                        </span>
                    </DropdownMenuRadioItem>

                    {hasUnknownSelection && (
                        <DropdownMenuRadioItem value={model} className="min-h-11 lg:min-h-8">
                            <span className="truncate">{model}</span>
                        </DropdownMenuRadioItem>
                    )}

                    <DropdownMenuSeparator />
                    <div className="max-h-[min(320px,60vh)] overflow-y-auto">
                        {catalogState === 'loading' && (
                            <div className="px-2 py-3 text-xs text-muted-foreground">
                                {t('ai.modelSelector.loading', { defaultValue: '加载模型中…' })}
                            </div>
                        )}

                        {catalogState === 'loaded' && models.length === 0 && (
                            <div className="px-2 py-3 text-xs text-muted-foreground">
                                {t('ai.modelSelector.empty', { defaultValue: '暂无可用模型' })}
                            </div>
                        )}

                        {Array.from(grouped.entries()).map(([provider, providerModels]) => (
                            <React.Fragment key={provider}>
                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    {provider}
                                </DropdownMenuLabel>
                                {providerModels.map((item) => (
                                    <DropdownMenuRadioItem
                                        key={item.id}
                                        value={item.id}
                                        className="min-h-11 lg:min-h-8"
                                    >
                                        <span className="truncate">{item.name || item.id}</span>
                                    </DropdownMenuRadioItem>
                                ))}
                            </React.Fragment>
                        ))}
                    </div>
                </DropdownMenuRadioGroup>

                {hasModelParams && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            disabled={disabled}
                            onSelect={() => setParamsOpen(true)}
                            className="min-h-11 gap-2 lg:min-h-8"
                        >
                            <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                                {t('ai.modelParams.title', { defaultValue: '模型参数' })}
                            </span>
                            {paramsCustomized && (
                                <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                            )}
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
