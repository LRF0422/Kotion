import React, { useEffect, useRef, useState } from 'react'
import type { CapturedFrame, CaptureRect } from './desktop-capture'

interface RegionSelectorProps {
    frame: CapturedFrame
    hint: string
    onCancel: () => void
    onSelect: (rect: CaptureRect) => void
}

interface Box {
    x: number
    y: number
    width: number
    height: number
}

/**
 * Drag-to-select overlay for region screenshots. Selection happens in display
 * pixels and is mapped back to the frame's natural resolution before cropping.
 */
export const RegionSelector: React.FC<RegionSelectorProps> = ({ frame, hint, onCancel, onSelect }) => {
    const imageRef = useRef<HTMLImageElement>(null)
    const startRef = useRef<{ x: number; y: number } | null>(null)
    const [box, setBox] = useState<Box | null>(null)

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCancel()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [onCancel])

    const pointInImage = (event: React.MouseEvent): { x: number; y: number } => {
        const rect = imageRef.current?.getBoundingClientRect()
        if (!rect) return { x: 0, y: 0 }
        return {
            x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
            y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
        }
    }

    const handleMouseDown = (event: React.MouseEvent) => {
        const point = pointInImage(event)
        startRef.current = point
        setBox({ x: point.x, y: point.y, width: 0, height: 0 })
    }

    const handleMouseMove = (event: React.MouseEvent) => {
        const start = startRef.current
        if (!start) return
        const point = pointInImage(event)
        setBox({
            x: Math.min(start.x, point.x),
            y: Math.min(start.y, point.y),
            width: Math.abs(point.x - start.x),
            height: Math.abs(point.y - start.y),
        })
    }

    const handleMouseUp = () => {
        const start = startRef.current
        startRef.current = null
        const rect = imageRef.current?.getBoundingClientRect()
        if (!start || !box || !rect || box.width < 4 || box.height < 4) {
            setBox(null)
            return
        }
        const scaleX = frame.width / rect.width
        const scaleY = frame.height / rect.height
        onSelect({
            x: box.x * scaleX,
            y: box.y * scaleY,
            width: box.width * scaleX,
            height: box.height * scaleY,
        })
    }

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            <div className="relative" onMouseDown={handleMouseDown}>
                <img
                    ref={imageRef}
                    src={frame.url}
                    alt=""
                    draggable={false}
                    className="max-h-[90vh] max-w-[90vw] select-none"
                />
                {box && (
                    <div
                        className="pointer-events-none absolute border border-primary bg-primary/20"
                        style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
                    />
                )}
            </div>
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1.5 text-xs text-white">
                {hint}
            </div>
        </div>
    )
}
