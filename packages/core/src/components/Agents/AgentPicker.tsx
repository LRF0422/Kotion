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
import { useCustomAgents, useTranslation } from '@kn/common'

const DEFAULT_AGENT_VALUE = '__default_agent__'

export interface AgentPickerProps {
    disabled?: boolean
    className?: string
}

/**
 * Compact custom-agent picker for the global AI assistant panel. Mirrors the
 * plugin-ai picker — plugins may not import core, so each surface owns one.
 */
export const AgentPicker: React.FC<AgentPickerProps> = ({ disabled, className = '' }) => {
    const { t } = useTranslation()
    const { agents, selectedAgent, selectedAgentId, loading, selectAgent } = useCustomAgents()
    const [open, setOpen] = useState(false)

    const defaultLabel = t('settings.agents.default', { defaultValue: '默认 Agent' })
    const displayLabel = selectedAgent?.name || defaultLabel

    return (
        <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
            <DropdownMenuTrigger asChild disabled={disabled}>
                <button
                    type="button"
                    disabled={disabled}
                    aria-label={t('settings.agents.pick', { defaultValue: '选择 Agent' }) + ': ' + displayLabel}
                    title={displayLabel}
                    className={
                        'flex h-7 max-w-[120px] shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50 '
                        + className
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
            <DropdownMenuContent align="end" className="w-[220px]">
                <DropdownMenuRadioGroup
                    value={selectedAgentId || DEFAULT_AGENT_VALUE}
                    onValueChange={value => selectAgent(value === DEFAULT_AGENT_VALUE ? null : value)}
                >
                    <DropdownMenuRadioItem value={DEFAULT_AGENT_VALUE} className="min-h-11 lg:min-h-8">
                        <span className="truncate">{defaultLabel}</span>
                    </DropdownMenuRadioItem>
                    {agents.length > 0 && <DropdownMenuSeparator />}
                    {agents.map(agent => (
                        <DropdownMenuRadioItem key={agent.id} value={agent.id} className="min-h-11 lg:min-h-8">
                            {agent.avatar ? (
                                <AgentAvatar id={agent.avatar} className="mr-1.5 h-4 w-4 shrink-0" />
                            ) : agent.emoji ? (
                                <span aria-hidden="true" className="mr-1.5">{agent.emoji}</span>
                            ) : null}
                            <span className="truncate">{agent.name}</span>
                        </DropdownMenuRadioItem>
                    ))}
                    {!loading && agents.length === 0 && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                                {t('settings.agents.emptyHint', { defaultValue: '在「设置 → 自定义 Agent」中创建' })}
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
