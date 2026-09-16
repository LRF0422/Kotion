import React, { useEffect, useRef, useState } from 'react'
import { useDesktop, useTranslation, useUploadFile } from '@kn/common'
import type { DesktopCaptureSource } from '@kn/common'
import {
    captureScreenshot,
    getCaptureSources,
    startRecording,
    type DesktopRecording,
} from './desktop-capture'

interface CaptureDialogProps {
    open: boolean
    onClose: () => void
}

type Translate = (key: string, options?: Record<string, unknown>) => string

const formatElapsed = (seconds: number): string => {
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
    const ss = String(seconds % 60).padStart(2, '0')
    return mm + ':' + ss
}

/** Map service/main error codes to localized text. */
const localizeCaptureError = (t: Translate, error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('CAPTURE_PERMISSION')) {
        const status = message.split('CAPTURE_PERMISSION:')[1]?.split(':')[0] ?? 'unknown'
        return t('desktopCapture.permissionDenied', { status })
    }
    if (message === 'CAPTURE_CANVAS') return t('desktopCapture.canvasUnavailable')
    if (message === 'CAPTURE_ENCODE') return t('desktopCapture.encodeFailed')
    return message
}

/**
 * Built-in screen capture: pick a screen/window, then take a screenshot or
 * record, uploading the result to the file center.
 */
export const CaptureDialog: React.FC<CaptureDialogProps> = ({ open, onClose }) => {
    const { t } = useTranslation()
    const desktop = useDesktop()
    const { uploadFile } = useUploadFile()
    const [mode, setMode] = useState<'screenshot' | 'recording'>('screenshot')
    const [sources, setSources] = useState<DesktopCaptureSource[]>([])
    const [loading, setLoading] = useState(false)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [recording, setRecording] = useState<DesktopRecording | null>(null)
    const [elapsed, setElapsed] = useState(0)
    const recordingRef = useRef<DesktopRecording | null>(null)

    useEffect(() => {
        if (!open || !desktop) return
        let cancelled = false
        setLoading(true)
        setMessage(null)
        getCaptureSources(desktop)
            .then((list) => {
                if (!cancelled) setSources(list)
            })
            .catch((error) => {
                if (!cancelled) setMessage(localizeCaptureError(t, error))
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, desktop])

    useEffect(() => {
        if (!recording) return
        const timer = setInterval(() => setElapsed((value) => value + 1), 1000)
        return () => clearInterval(timer)
    }, [recording])

    // Never leak an active recording when the dialog unmounts.
    useEffect(() => () => {
        recordingRef.current?.cancel()
        recordingRef.current = null
    }, [])

    const save = async (file: File) => {
        await uploadFile(file)
        setMessage(t('desktopCapture.saved', { name: file.name }))
    }

    const handlePick = async (source: DesktopCaptureSource) => {
        if (!desktop) return
        setBusy(true)
        setMessage(null)
        try {
            if (mode === 'screenshot') {
                const file = await captureScreenshot(source.id)
                await save(file)
                onClose()
            } else {
                const active = await startRecording(source.id)
                recordingRef.current = active
                setRecording(active)
                setElapsed(0)
            }
        } catch (error) {
            setMessage(localizeCaptureError(t, error))
        } finally {
            setBusy(false)
        }
    }

    const handleStop = async () => {
        const active = recordingRef.current
        if (!active) return
        setBusy(true)
        try {
            const file = await active.stop()
            recordingRef.current = null
            setRecording(null)
            await save(file)
            onClose()
        } catch (error) {
            setMessage(localizeCaptureError(t, error))
        } finally {
            setBusy(false)
        }
    }

    const handleCancel = () => {
        recordingRef.current?.cancel()
        recordingRef.current = null
        setRecording(null)
        setElapsed(0)
    }

    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
            onClick={recording ? undefined : onClose}
        >
            <div
                className="flex max-h-[80vh] w-[680px] max-w-full flex-col overflow-hidden rounded-lg border bg-background text-foreground shadow-xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b px-4 py-2.5">
                    <span className="text-sm font-medium">{t('desktopCapture.title')}</span>
                    <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={recording ? handleCancel : onClose}
                    >
                        ✕
                    </button>
                </div>

                {!desktop && (
                    <div className="px-4 py-3 text-xs text-amber-600">{t('desktopCapture.desktopOnly')}</div>
                )}

                {desktop && recording && (
                    <div className="flex flex-col items-center gap-3 px-4 py-8">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                            <span className="font-mono text-lg">{formatElapsed(elapsed)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{t('desktopCapture.recordingHint')}</p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={busy}
                                onClick={handleStop}
                                className="h-8 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-50"
                            >
                                {t('desktopCapture.stopAndSave')}
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={handleCancel}
                                className="h-8 rounded-md border px-4 text-xs disabled:opacity-50"
                            >
                                {t('desktopCapture.discard')}
                            </button>
                        </div>
                    </div>
                )}

                {desktop && !recording && (
                    <>
                        <div className="flex items-center gap-1 border-b px-4 py-2">
                            {(['screenshot', 'recording'] as const).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setMode(value)}
                                    className={
                                        'h-7 rounded-md px-3 text-xs ' +
                                        (mode === value ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60')
                                    }
                                >
                                    {value === 'screenshot'
                                        ? t('desktopCapture.screenshotTab')
                                        : t('desktopCapture.recordingTab')}
                                </button>
                            ))}
                            {loading && <span className="ml-2 text-[11px] text-muted-foreground">{t('desktopCapture.loadingSources')}</span>}
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-4">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {sources.map((source) => (
                                    <button
                                        key={source.id}
                                        type="button"
                                        disabled={busy}
                                        onClick={() => handlePick(source)}
                                        className="group overflow-hidden rounded-md border text-left transition-colors hover:border-primary disabled:opacity-50"
                                    >
                                        <div className="flex h-24 items-center justify-center bg-muted/40">
                                            {source.thumbnail ? (
                                                <img src={source.thumbnail} alt={source.name} className="max-h-full max-w-full" />
                                            ) : (
                                                <span className="text-[11px] text-muted-foreground">{t('desktopCapture.noPreview')}</span>
                                            )}
                                        </div>
                                        <div className="truncate px-2 py-1.5 text-[11px]" title={source.name}>
                                            {source.name}
                                        </div>
                                    </button>
                                ))}
                                {!loading && sources.length === 0 && (
                                    <p className="col-span-full text-xs text-muted-foreground">{t('desktopCapture.noSources')}</p>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {message && (
                    <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">{message}</div>
                )}
            </div>
        </div>
    )
}
