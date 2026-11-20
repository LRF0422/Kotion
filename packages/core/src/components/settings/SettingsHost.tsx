import React, { useEffect, useState } from 'react'
import { event, OPEN_SETTINGS, type OpenSettingsPayload } from '@kn/common'
import { SettingDlg } from './SeetingDlg'

/**
 * App-lifetime settings dialog for *programmatic* deep links.
 *
 * The menu/rail triggers each own a `SettingDlg` instance, but plugins cannot
 * import core UI. A plugin (e.g. the chat's agent picker) emits `OPEN_SETTINGS`
 * and this single host opens the dialog on the requested panel.
 *
 * Mounted lazily on the first request and kept afterwards: Radix unmounts the
 * content when closed, so an idle host costs one component and keeps the close
 * animation intact.
 */
export const SettingsHost: React.FC = () => {
    const [mounted, setMounted] = useState(false)
    const [open, setOpen] = useState(false)
    const [panelKey, setPanelKey] = useState<string | undefined>(undefined)
    const [agentId, setAgentId] = useState<string | undefined>(undefined)

    useEffect(() => {
        const handler = (payload?: OpenSettingsPayload) => {
            setAgentId(payload?.agentId)
            setPanelKey(payload?.key)
            setMounted(true)
            setOpen(true)
        }
        event.on(OPEN_SETTINGS, handler)
        return () => { event.off(OPEN_SETTINGS, handler) }
    }, [])

    if (!mounted) return null

    return (
        <SettingDlg
            open={open}
            onOpenChange={next => {
                setOpen(next)
                // One-shot: reopening settings must not silently reopen an
                // editor the user already dismissed.
                if (!next) setAgentId(undefined)
            }}
            initialKey={panelKey}
            agentFocusId={agentId}
        />
    )
}