import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '@kn/common'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@kn/ui'
import { CaptureDialog } from './CaptureDialog'

const CaptureIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
        <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2l1-1.6A1 1 0 0 1 8.55 4h6.9a1 1 0 0 1 .85.4l1 1.6h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" strokeLinejoin="round" />
        <circle cx="12" cy="12.5" r="3.2" />
    </svg>
)

/**
 * Screenshot / recording entry point for the macOS title band.
 *
 * Icon-only with a tooltip: a text label next to the traffic lights read as a
 * cramped control. The dialog is portalled to document.body because a
 * transformed ancestor becomes the containing block for position:fixed
 * descendants (which squeezed the dialog into the button).
 */
export const CaptureTitleButton: React.FC = () => {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const isDesktopApp = typeof window !== 'undefined' && Boolean((window as any).knDesktop)
    if (!isDesktopApp) return null

    const label = t('desktopCapture.title')

    return (
        <>
            <TooltipProvider delayDuration={200}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={() => setOpen(true)}
                            aria-label={label}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <CaptureIcon />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{label}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
            {open && createPortal(
                <CaptureDialog open={open} onClose={() => setOpen(false)} />,
                document.body,
            )}
        </>
    )
}
