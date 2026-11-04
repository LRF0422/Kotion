/**
 * ImageLightbox — click-to-enlarge viewer for chat images / attachments.
 *
 * Chat surfaces render image thumbnails (a pasted screenshot is 56–180px), which
 * is too small to read. {@link ZoomableImage} wraps such a thumbnail in a
 * button; clicking it opens the full-screen {@link ImageLightbox} with
 * zoom / pan / gallery navigation.
 *
 * The lightbox is intentionally self-contained (portal + body scroll lock +
 * keyboard handling) so it works from any host — the side dock, the floating
 * assistant panel or the full-page AI home — without touching their layout.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from "@kn/icon"
import { cn } from "../../lib/utils"

export interface ImageLightboxLabels {
  /** Accessible name of the dialog. */
  dialog?: string
  close?: string
  zoomIn?: string
  zoomOut?: string
  /** Restore the image to fit the viewport. */
  reset?: string
  previous?: string
  next?: string
  /** Keyboard / gesture hint shown under the image. */
  hint?: string
  loadError?: string
  /** e.g. "2 / 5"; only rendered when the gallery has more than one image. */
  counter?: (current: number, total: number) => string
}

export interface ImageLightboxProps {
  open: boolean
  /** `data:` / `blob:` / http image sources. */
  images: string[]
  /** Active image; omit to let the viewer keep it internally. */
  index?: number
  onIndexChange?: (index: number) => void
  onOpenChange?: (open: boolean) => void
  labels?: ImageLightboxLabels
}

export interface ZoomableImageProps {
  src: string
  alt?: string
  /** Applied to the `<img>` (size, border, rounding, ...). */
  className?: string
  /** Applied to the trigger button (rounding / overflow / focus ring). */
  wrapperClassName?: string
  /** Sibling images of the same message, for ← → navigation in the viewer. */
  gallery?: string[]
  /** Position of `src` inside `gallery`. */
  index?: number
  /** Trigger accessible name / tooltip. */
  zoomLabel?: string
  labels?: ImageLightboxLabels
}

const ZOOM_STOPS = [1, 1.5, 2, 3, 4] as const
const STAGE_PADDING = 32

const DEFAULT_LABELS: Required<Omit<ImageLightboxLabels, "counter">> & {
  counter: (current: number, total: number) => string
} = {
  dialog: "Image preview",
  close: "Close preview",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  reset: "Reset zoom",
  previous: "Previous image",
  next: "Next image",
  hint: "Scroll to zoom · drag to pan · double-click to reset",
  loadError: "Couldn't load this image",
  counter: (current, total) => `${current} / ${total}`,
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

interface Offset {
  x: number
  y: number
}

interface NaturalSize {
  w: number
  h: number
}

interface StageSize {
  w: number
  h: number
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

const EMPTY_OFFSET: Offset = { x: 0, y: 0 }

const LightboxButton: React.FC<{
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}> = ({ label, onClick, disabled, className, children }) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "flex h-11 w-11 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-30 lg:h-8 lg:w-8",
      className,
    )}
  >
    {children}
  </button>
)

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  open,
  images,
  index,
  onIndexChange,
  onOpenChange,
  labels,
}) => {
  const text = useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels])
  const total = images.length

  const [internalIndex, setInternalIndex] = useState(0)
  const [scaleIndex, setScaleIndex] = useState(0)
  const [offset, setOffset] = useState<Offset>(EMPTY_OFFSET)
  const [natural, setNatural] = useState<NaturalSize | null>(null)
  const [stage, setStage] = useState<StageSize>({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)
  const [failed, setFailed] = useState(false)

  const dialogRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<DragState | null>(null)

  const activeIndex = total > 0
    ? clamp(index ?? internalIndex, 0, total - 1)
    : 0
  const src = total > 0 ? images[activeIndex] : undefined
  const scale = ZOOM_STOPS[scaleIndex]

  const close = useCallback(() => onOpenChange?.(false), [onOpenChange])

  const goTo = useCallback((next: number) => {
    if (total === 0) return
    const wrapped = ((next % total) + total) % total
    onIndexChange?.(wrapped)
    if (index === undefined) setInternalIndex(wrapped)
  }, [index, onIndexChange, total])

  const zoomBy = useCallback((delta: number) => {
    setScaleIndex(current => clamp(current + delta, 0, ZOOM_STOPS.length - 1))
  }, [])

  const resetZoom = useCallback(() => {
    setScaleIndex(0)
    setOffset(EMPTY_OFFSET)
  }, [])

  // A new image (or reopening) starts from the fitted view.
  useEffect(() => {
    if (!open) return
    setScaleIndex(0)
    setOffset(EMPTY_OFFSET)
    setNatural(null)
    setFailed(false)
    dragRef.current = null
    setDragging(false)
  }, [open, src])

  // Keep the page behind the viewer from scrolling while it is open.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Focus the viewer on open, and give focus back to the thumbnail on close.
  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const timer = window.setTimeout(() => dialogRef.current?.focus(), 0)
    return () => {
      window.clearTimeout(timer)
      restoreFocusRef.current?.focus()
      restoreFocusRef.current = null
    }
  }, [open])

  // Measure the stage so the image can be fitted and panning can be clamped.
  useEffect(() => {
    if (!open) return
    const element = stageRef.current
    if (!element) return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      setStage({
        w: Math.max(0, rect.width - STAGE_PADDING),
        h: Math.max(0, rect.height - STAGE_PADDING),
      })
    }
    measure()
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure)
      return () => window.removeEventListener("resize", measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [open])

  // Wheel zooms the image. Native (non-passive) listener so preventDefault works.
  useEffect(() => {
    if (!open) return
    const element = stageRef.current
    if (!element) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoomBy(event.deltaY < 0 ? 1 : -1)
    }
    element.addEventListener("wheel", handleWheel, { passive: false })
    return () => element.removeEventListener("wheel", handleWheel)
  }, [open, zoomBy])

  // The fitted (scale = 1) size: never upscale small images, fit large ones.
  const baseSize = useMemo(() => {
    if (!natural || stage.w <= 0 || stage.h <= 0) return null
    const ratio = Math.min(stage.w / natural.w, stage.h / natural.h, 1)
    return {
      w: Math.max(1, Math.round(natural.w * ratio)),
      h: Math.max(1, Math.round(natural.h * ratio)),
    }
  }, [natural, stage])

  const clampOffset = useCallback((next: Offset, currentScale: number): Offset => {
    if (!baseSize) return EMPTY_OFFSET
    const maxX = Math.max(0, (baseSize.w * currentScale - stage.w) / 2)
    const maxY = Math.max(0, (baseSize.h * currentScale - stage.h) / 2)
    return {
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    }
  }, [baseSize, stage])

  // Zooming out may leave the image off-center; pull it back into view.
  useEffect(() => {
    setOffset(current => clampOffset(current, scale))
  }, [clampOffset, scale])

  // Keyboard: Esc closes, ←/→ navigate, +/- zoom, 0 resets.
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "Escape":
          event.stopPropagation()
          close()
          break
        case "ArrowLeft":
          if (total > 1) goTo(activeIndex - 1)
          break
        case "ArrowRight":
          if (total > 1) goTo(activeIndex + 1)
          break
        case "+":
        case "=":
          zoomBy(1)
          break
        case "-":
        case "_":
          zoomBy(-1)
          break
        case "0":
          resetZoom()
          break
        default:
          break
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeIndex, close, goTo, open, resetZoom, total, zoomBy])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (scale <= 1) return
    if (event.pointerType === "mouse" && event.button !== 0) return
    // Do not steal the gesture from the gallery / toolbar buttons: with pointer
    // capture on the stage their click would be dispatched to the stage instead.
    if ((event.target as HTMLElement | null)?.closest("button")) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    }
    setDragging(true)
  }, [offset.x, offset.y, scale])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setOffset(clampOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    }, scale))
  }, [clampOffset, scale])

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
  }, [])

  const handleImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      setNatural({ w: image.naturalWidth, h: image.naturalHeight })
      setFailed(false)
    }
  }, [])

  const handleDoubleClick = useCallback(() => {
    setScaleIndex(current => (current === 0 ? ZOOM_STOPS.indexOf(2) : 0))
    setOffset(EMPTY_OFFSET)
  }, [])

  if (!open || !src) return null

  const imageStyle: React.CSSProperties = baseSize
    ? {
        width: baseSize.w,
        height: baseSize.h,
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
      }
    : { maxWidth: "100%", maxHeight: "100%" }

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={text.dialog}
      tabIndex={-1}
      className="fixed inset-0 z-[300] flex flex-col bg-black/90 pt-safe-top outline-none backdrop-blur-sm"
    >
      <div className="flex h-11 shrink-0 items-center gap-1 px-2">
        <span className="min-w-12 px-1 text-xs tabular-nums text-white/60">
          {total > 1 ? text.counter(activeIndex + 1, total) : ""}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <LightboxButton
            label={text.zoomOut}
            onClick={() => zoomBy(-1)}
            disabled={scaleIndex === 0}
          >
            <ZoomOut className="h-4 w-4" />
          </LightboxButton>
          <span className="w-10 text-center text-[11px] tabular-nums text-white/55">
            {Math.round(scale * 100)}%
          </span>
          <LightboxButton
            label={text.zoomIn}
            onClick={() => zoomBy(1)}
            disabled={scaleIndex === ZOOM_STOPS.length - 1}
          >
            <ZoomIn className="h-4 w-4" />
          </LightboxButton>
          <LightboxButton label={text.reset} onClick={resetZoom}>
            <RotateCcw className="h-4 w-4" />
          </LightboxButton>
          <span aria-hidden className="mx-1 h-4 w-px bg-white/15" />
          <LightboxButton label={text.close} onClick={close}>
            <X className="h-4 w-4" />
          </LightboxButton>
        </div>
      </div>

      <div
        ref={stageRef}
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4",
          scale > 1
            ? dragging ? "cursor-grabbing" : "cursor-grab"
            : "cursor-zoom-out",
        )}
        style={{ touchAction: scale > 1 ? "none" : "manipulation" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 cursor-zoom-out"
          onClick={close}
        />
        {failed ? (
          <p className="relative z-10 text-xs text-white/60">{text.loadError}</p>
        ) : (
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={handleImageLoad}
            onError={() => setFailed(true)}
            onDoubleClick={handleDoubleClick}
            style={imageStyle}
            className="relative z-10 block max-w-none select-none rounded-sm object-contain shadow-2xl"
          />
        )}

        {total > 1 && (
          <>
            <LightboxButton
              label={text.previous}
              onClick={() => goTo(activeIndex - 1)}
              className="absolute left-2 top-1/2 z-20 h-11 w-11 -translate-y-1/2 rounded-full bg-black/40 hover:bg-black/60 lg:h-10 lg:w-10"
            >
              <ChevronLeft className="h-5 w-5" />
            </LightboxButton>
            <LightboxButton
              label={text.next}
              onClick={() => goTo(activeIndex + 1)}
              className="absolute right-2 top-1/2 z-20 h-11 w-11 -translate-y-1/2 rounded-full bg-black/40 hover:bg-black/60 lg:h-10 lg:w-10"
            >
              <ChevronRight className="h-5 w-5" />
            </LightboxButton>
          </>
        )}
      </div>

      <div className="shrink-0 pb-safe-bottom">
        <div className="px-4 pb-3 pt-1 text-center text-[11px] text-white/45">
          {text.hint}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * A thumbnail that opens {@link ImageLightbox} on click. The hover veil with a
 * maximize glyph is what tells the user the image is enlargeable — a bare
 * `cursor: zoom-in` is invisible on touch.
 */
export const ZoomableImage: React.FC<ZoomableImageProps> = ({
  src,
  alt = "",
  className,
  wrapperClassName,
  gallery,
  index = 0,
  zoomLabel,
  labels,
}) => {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(index)
  const images = gallery && gallery.length > 0 ? gallery : [src]
  const label = zoomLabel ?? "Click to enlarge"

  return (
    <>
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={() => {
          setActiveIndex(index)
          setOpen(true)
        }}
        className={cn(
          "group/zoom relative block cursor-zoom-in overflow-hidden rounded-lg border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          wrapperClassName,
        )}
      >
        <img src={src} alt={alt} draggable={false} className={cn("block", className)} />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/0 opacity-0 transition-opacity duration-150 group-hover/zoom:bg-black/25 group-hover/zoom:opacity-100 group-focus-visible/zoom:bg-black/25 group-focus-visible/zoom:opacity-100"
        >
          <Maximize2 className="h-4 w-4 text-white drop-shadow" />
        </span>
      </button>
      <ImageLightbox
        open={open}
        images={images}
        index={activeIndex}
        onIndexChange={setActiveIndex}
        onOpenChange={setOpen}
        labels={labels}
      />
    </>
  )
}
