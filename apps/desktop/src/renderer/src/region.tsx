import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

interface RegionContext {
    url: string
    width: number
    height: number
    locale: 'zh' | 'en'
}

interface Box {
    x: number
    y: number
    width: number
    height: number
}

const TEXT = {
    zh: { hint: '拖动选择区域，回车确认，Esc 取消', confirm: '确认', cancel: '取消' },
    en: { hint: 'Drag to select a region, Enter to confirm, Esc to cancel', confirm: 'Confirm', cancel: 'Cancel' },
}

type Bridge = { invoke: (capability: string, params?: unknown) => Promise<unknown> }
const bridge = (window as unknown as { knDesktop?: Bridge }).knDesktop

/**
 * Full-screen region overlay. It fills the captured display, so selection
 * coordinates in CSS pixels map to the frame's natural pixels by ratio.
 */
const RegionOverlay: React.FC = () => {
    const [context, setContext] = useState<RegionContext | null>(null)
    const [box, setBox] = useState<Box | null>(null)
    const startRef = useRef<{ x: number; y: number } | null>(null)
    const boxRef = useRef<Box | null>(null)
    boxRef.current = box

    useEffect(() => {
        bridge?.invoke('capture.region.context')
            .then((value) => setContext(value as RegionContext))
            .catch(() => undefined)
    }, [])

    const submit = (value: Box | null) => {
        if (!context) return
        if (!value || value.width < 1 || value.height < 1) {
            void bridge?.invoke('capture.region.submit', null)
            return
        }
        const scaleX = context.width / window.innerWidth
        const scaleY = context.height / window.innerHeight
        void bridge?.invoke('capture.region.submit', {
            x: value.x * scaleX,
            y: value.y * scaleY,
            width: value.width * scaleX,
            height: value.height * scaleY,
        })
    }

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') submit(null)
            if (event.key === 'Enter') submit(boxRef.current)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [context])

    const handleMouseDown = (event: React.MouseEvent) => {
        startRef.current = { x: event.clientX, y: event.clientY }
        setBox({ x: event.clientX, y: event.clientY, width: 0, height: 0 })
    }

    const handleMouseMove = (event: React.MouseEvent) => {
        const start = startRef.current
        if (!start) return
        setBox({
            x: Math.min(start.x, event.clientX),
            y: Math.min(start.y, event.clientY),
            width: Math.abs(event.clientX - start.x),
            height: Math.abs(event.clientY - start.y),
        })
    }

    if (!context) return React.createElement('div', { style: { position: 'fixed', inset: 0, background: '#000' } })

    const text = TEXT[context.locale] ?? TEXT.zh
    const naturalWidth = box ? Math.round(box.width * (context.width / window.innerWidth)) : 0
    const naturalHeight = box ? Math.round(box.height * (context.height / window.innerHeight)) : 0

    return (
        <div
            style={{ position: 'fixed', inset: 0, userSelect: 'none' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
        >
            <img
                src={context.url}
                alt=""
                draggable={false}
                style={{ display: 'block', width: '100vw', height: '100vh', objectFit: 'fill' }}
            />
            {box ? (
                <div
                    style={{
                        position: 'absolute',
                        left: box.x,
                        top: box.y,
                        width: box.width,
                        height: box.height,
                        border: '1px solid #3b82f6',
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                        pointerEvents: 'none',
                    }}
                />
            ) : (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
            )}
            <div
                style={{
                    position: 'absolute', left: '50%', top: 16, transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.72)', color: '#fff', padding: '6px 12px',
                    borderRadius: 6, fontSize: 12,
                }}
            >
                {text.hint}
            </div>
            {box && (
                <div
                    style={{
                        position: 'absolute', left: box.x, top: Math.max(8, box.y - 38),
                        display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.82)',
                        color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 12,
                    }}
                >
                    <span>{naturalWidth} × {naturalHeight}</span>
                    <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); submit(box) }}
                        style={{ background: '#2563eb', color: '#fff', border: 0, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
                    >
                        {text.confirm}
                    </button>
                    <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); submit(null) }}
                        style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', border: 0, borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
                    >
                        {text.cancel}
                    </button>
                </div>
            )}
        </div>
    )
}

createRoot(document.getElementById('root')!).render(<RegionOverlay />)
