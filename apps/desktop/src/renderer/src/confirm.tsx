import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, cn } from '@kn/ui'
import '@kn/ui/globals.css'
import type { ConfirmRequestPayload } from '../../shared/confirm'

/**
 * Host-owned confirmation window.
 *
 * Security gates in the main process (SSH host grants, raw sockets, opening the
 * system browser) load this page in a dedicated frameless window. It renders the
 * same design tokens/components as the app instead of a native message box.
 *
 * The main process scopes both the payload (`dialog.confirm.context`) and the
 * answer (`dialog.confirmResult`) to this window's webContents, so renderer
 * plugins cannot read or answer a prompt on the user's behalf.
 */

type DesktopBridge = {
    invoke(capability: string, params?: unknown): Promise<unknown>
}

const bridge = (window as unknown as { knDesktop?: DesktopBridge }).knDesktop
const isZh = (): boolean =>
    (localStorage.getItem('language') || navigator.language || '').toLowerCase().startsWith('zh')

const KIND_ICONS = {
    ssh: TerminalIcon,
    network: GlobeIcon,
    browser: GlobeIcon,
} as const

/** Inline SVGs: the confirmation entry must not add a dependency to the desktop package. */
function TerminalIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="m7 9 3 3-3 3" />
            <path d="M13 15h4" />
        </svg>
    )
}

function GlobeIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
        </svg>
    )
}

function ShieldIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3 20 6v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
        </svg>
    )
}

const toneClass = (tone: string | undefined): string => {
    if (tone === 'danger') return 'font-medium text-destructive'
    if (tone === 'muted') return 'text-muted-foreground'
    return 'text-foreground'
}

const LoadingCard: React.FC<{ text: string }> = ({ text }) => (
    <div className="flex h-screen w-screen items-center justify-center">
        <div className="w-full rounded-2xl bg-popover px-5 py-6 text-sm text-muted-foreground">
            {text}
        </div>
    </div>
)

const ConfirmApp: React.FC = () => {
    const [payload, setPayload] = useState<ConfirmRequestPayload | null>(null)
    const [failure, setFailure] = useState('')
    const [busy, setBusy] = useState(false)
    const cardRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        let alive = true
        bridge
            ?.invoke('dialog.confirm.context')
            .then(value => {
                if (alive) setPayload(value as ConfirmRequestPayload)
            })
            .catch(() => {
                if (alive) {
                    setFailure(isZh() ? '无法加载这条确认请求' : 'Could not load this confirmation request')
                }
            })
        return () => {
            alive = false
        }
    }, [])

    // Let the main process size the window to the card so the transparent
    // window never shows dead space (or clips the copy).
    useEffect(() => {
        const card = cardRef.current
        if (!card) return
        const report = () => {
            const height = Math.ceil(card.getBoundingClientRect().height)
            void bridge?.invoke('dialog.confirmResize', { height }).catch(() => undefined)
        }
        report()
        const observer = new ResizeObserver(report)
        observer.observe(card)
        return () => observer.disconnect()
    }, [payload])

    const answer = useCallback(
        (allowed: boolean) => {
            if (busy) return
            setBusy(true)
            void bridge
                ?.invoke('dialog.confirmResult', { id: payload?.id, allowed })
                .catch(() => {
                    setBusy(false)
                    setFailure(isZh() ? '提交失败，请重试' : 'Could not submit the answer, please retry')
                })
        },
        [busy, payload?.id],
    )

    // The prompt is security-sensitive: Escape always denies.
    const answerRef = useRef(answer)
    answerRef.current = answer
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            answerRef.current(false)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [])

    if (!payload) {
        return (
            <>
                <LoadingCard
                    text={
                        failure ||
                        (isZh() ? '正在加载确认请求…' : 'Loading confirmation request…')
                    }
                />
                {failure && (
                    <div className="fixed inset-x-3 bottom-3">
                        <Button variant="outline" className="h-9 w-full" onClick={() => answer(false)}>
                            {isZh() ? '拒绝并关闭' : 'Deny and close'}
                        </Button>
                    </div>
                )}
            </>
        )
    }

    const Icon = KIND_ICONS[payload.kind] ?? ShieldIcon

    return (
        <div className="flex h-screen w-screen items-center justify-center font-sans antialiased">
            <div
                ref={cardRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby="confirm-message"
                className="w-full overflow-hidden rounded-2xl bg-popover text-popover-foreground"
            >
                <div className="flex items-start gap-3 px-5 pt-5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(212_90%_62%/0.12)] text-[hsl(212_90%_62%)]">
                        <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 id="confirm-title" className="text-sm font-semibold leading-6 text-foreground">
                            {payload.title}
                        </h1>
                        <p id="confirm-message" className="mt-0.5 text-sm leading-5 text-muted-foreground">
                            {payload.message}
                        </p>
                    </div>
                </div>

                {payload.rows.length > 0 && (
                    <dl className="mx-5 mt-4 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs leading-5">
                        {payload.rows.map((row, index) => (
                            <div key={`${row.label}-${index}`} className="contents">
                                <dt className="text-muted-foreground">{row.label}</dt>
                                <dd className={cn('m-0 break-words', toneClass(row.tone))}>{row.value}</dd>
                            </div>
                        ))}
                    </dl>
                )}

                {payload.note && (
                    <p className="mx-5 mt-4 text-xs leading-5 text-muted-foreground">{payload.note}</p>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2 px-5 pb-5">
                    <Button
                        variant="secondary"
                        autoFocus
                        disabled={busy}
                        className="h-9"
                        onClick={() => answer(false)}
                    >
                        {payload.denyLabel}
                    </Button>
                    <Button
                        disabled={busy}
                        className="h-9 bg-[hsl(212_90%_62%)] text-white hover:bg-[hsl(212_90%_56%)]"
                        onClick={() => answer(true)}
                    >
                        {payload.allowLabel}
                    </Button>
                </div>
            </div>
        </div>
    )
}

createRoot(document.getElementById('root')!).render(<ConfirmApp />)
