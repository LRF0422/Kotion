import React, { useState } from 'react'
import { Bot, ChevronDown } from '@kn/icon'
import {
    AgentAvatar,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@kn/ui'
import {
    useCustomAgents,
    useTranslation,
} from '@kn/common'

const DEFAULT_AGENT_VALUE = '__default_agent__'

type AgentSelectorDensity = 'compact' | 'comfortable'

export interface AgentSelectorProps {
    disabled?: boolean
    density?: AgentSelectorDensity
    triggerClassName?: string
    contentClassName?: string
}

/**
 * Chat-time custom-agent picker. The selection is a shared preference stored
 * with the agent definitions; the surface that starts the run reads it and
 * appends the agent's guidance to the run system prompt.
 */
export const AgentSelector: React.FC<AgentSelectorProps> = ({
    disabled,
    density = 'compact',
    triggerClassName = '',
    contentClassName = '',
}) => {
    const { t } = useTranslation()
    const { agents, selectedAgent, selectedAgentId, loading, selectAgent } = useCustomAgents()
    const [open, setOpen] = useState(false)

    const defaultLabel = t('ai.agentSelector.default', { defaultValue: '默认 Agent' })
    const displayLabel = selectedAgent?.name || defaultLabel
    const selectorLabel = t('ai.agentSelector.label', { defaultValue: '选择 Agent' })
    const densityClass = density === 'comfortable' ? 'lg:h-8 lg:px-2.5' : 'lg:h-7 lg:px-2'

    return (
        <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <button
                    type="button"
                    disabled={disabled}
                    onPointerDown={event => event.stopPropagation()}
                    onMouseDown={event => event.stopPropagation()}
                    onClick={event => event.stopPropagation()}
                    aria-label={selectorLabel + ': ' + displayLabel}
                    title={displayLabel}
                    className={
                        'relative flex h-11 max-w-[150px] shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 '
                        + densityClass + ' ' + triggerClassName
                    }
                >
                    {selectedAgent?.avatar ? (
                        <AgentAvatar id={selectedAgent.avatar} className="h-3.5 w-3.5 shrink-0" />
                    ) : selectedAgent?.emoji ? (
                        <span aria-hidden="true" className="shrink-0 text-sm">{selectedAgent.emoji}</span>
                    ) : (
                        <Bot aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{displayLabel}</span>
                    <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="start"
                onPointerDown={event => event.stopPropagation()}
                onMouseDown={event => event.stopPropagation()}
                onClick={event => event.stopPropagation()}
                className={'w-[240px] max-w-[calc(100vw-24px)] border-border/40 ' + contentClassName}
            >
                <DropdownMenuRadioGroup
                    value={selectedAgentId || DEFAULT_AGENT_VALUE}
                    onValueChange={value => selectAgent(value === DEFAULT_AGENT_VALUE ? null : value)}
                >
                    <DropdownMenuRadioItem value={DEFAULT_AGENT_VALUE} className="min-h-11 lg:min-h-8">
                        <span className="truncate">{defaultLabel}</span>
                    </DropdownMenuRadioItem>

                    {agents.length > 0 && <DropdownMenuSeparator />}
                    <div className="max-h-[min(320px,60vh)] overflow-y-auto">
                        {agents.map(agent => (
                            <DropdownMenuRadioItem
                                key={agent.id}
                                value={agent.id}
                                className="min-h-11 lg:min-h-8"
                            >
                                {agent.avatar ? (
                                    <AgentAvatar id={agent.avatar} className="mr-1.5 h-4 w-4 shrink-0" />
                                ) : agent.emoji ? (
                                    <span aria-hidden="true" className="mr-1.5 shrink-0">{agent.emoji}</span>
                                ) : null}
                                <span className="truncate">{agent.name}</span>
                            </DropdownMenuRadioItem>
                        ))}
                    </div>

                    {!loading && agents.length === 0 && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                                {t('ai.agentSelector.emptyHint', {
                                    defaultValue: '在「设置 → 自定义 Agent」中创建',
                                })}
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
