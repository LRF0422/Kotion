import React, { useState } from 'react'
import { CaptureDialog } from './CaptureDialog'

const CaptureIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
        <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2l1-1.6A1 1 0 0 1 8.55 4h6.9a1 1 0 0 1 .85.4l1 1.6h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" strokeLinejoin="round" />
        <circle cx="12" cy="12.5" r="3.2" />
    </svg>
)

/**
 * Screenshot / recording entry point for the macOS title band. Living in the
 * shell keeps it reachable in fullscreen, where the band is no longer hidden.
 */
export const CaptureTitleButton: React.FC = () => {
    const [open, setOpen] = useState(false)
    const isDesktopApp = typeof window !== 'undefined' && Boolean((window as any).knDesktop)
    if (!isDesktopApp) return null

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                title="截图 / 录屏"
                aria-label="截图 / 录屏"
                className="flex h-6 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
                <CaptureIcon />
                <span className="hidden sm:inline">截图</span>
            </button>
            <CaptureDialog open={open} onClose={() => setOpen(false)} />
        </>
    )
}
