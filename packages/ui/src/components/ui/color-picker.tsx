import { Button } from '@ui/components/ui/button'
import { Input } from '@ui/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/components/ui/popover'
import { cn } from '@ui/lib/utils'
import { Paintbrush, X, CheckIcon } from '@kn/icon'
import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Toggle } from '..'

// ---------------------------------------------------------------------------
// HSB <-> Hex color conversion utilities
// ---------------------------------------------------------------------------
interface HSB { h: number; s: number; b: number }

function hsbToHex({ h, s, b }: HSB): string {
  const sf = s / 100
  const bf = b / 100
  const c = bf * sf
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = bf - c
  let r = 0, g = 0, bl = 0
  if (h < 60) { r = c; g = x; bl = 0 }
  else if (h < 120) { r = x; g = c; bl = 0 }
  else if (h < 180) { r = 0; g = c; bl = x }
  else if (h < 240) { r = 0; g = x; bl = c }
  else if (h < 300) { r = x; g = 0; bl = c }
  else { r = c; g = 0; bl = x }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`
}

function hexToHsb(hex: string): HSB {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16) / 255
  const g = parseInt(clean.substring(2, 4), 16) / 255
  const b = parseInt(clean.substring(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  const s = max === 0 ? 0 : (d / max) * 100
  const brightness = max * 100
  return { h, s, b: brightness }
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ---------------------------------------------------------------------------
// Default swatches
// ---------------------------------------------------------------------------
const DEFAULT_SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#000000',
]

// ---------------------------------------------------------------------------
// SaturationBrightness Area
// ---------------------------------------------------------------------------
const SaturationBrightnessArea: React.FC<{
  hue: number
  saturation: number
  brightness: number
  onChange: (s: number, b: number) => void
}> = ({ hue, saturation, brightness, onChange }) => {
  const areaRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handlePointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    const rect = areaRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    onChange(x * 100, (1 - y) * 100)
  }, [onChange])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    handlePointer(e)
  }, [handlePointer])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragging.current) handlePointer(e)
  }, [handlePointer])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const hueColor = `hsl(${hue}, 100%, 50%)`

  return (
    <div
      ref={areaRef}
      className="relative w-full h-40 rounded-lg cursor-crosshair select-none touch-none"
      style={{ backgroundColor: hueColor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* White overlay (saturation) */}
      <div className="absolute inset-0 rounded-lg" style={{ background: 'linear-gradient(to right, #ffffff, transparent)' }} />
      {/* Black overlay (brightness) */}
      <div className="absolute inset-0 rounded-lg" style={{ background: 'linear-gradient(to bottom, transparent, #000000)' }} />
      {/* Thumb */}
      <div
        className="absolute w-4 h-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_2px_4px_rgba(0,0,0,0.2)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          left: `${saturation}%`,
          top: `${100 - brightness}%`,
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hue Slider
// ---------------------------------------------------------------------------
const HueSlider: React.FC<{
  hue: number
  onChange: (h: number) => void
}> = ({ hue, onChange }) => {
  const sliderRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handlePointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    const rect = sliderRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onChange(x * 360)
  }, [onChange])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    handlePointer(e)
  }, [handlePointer])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragging.current) handlePointer(e)
  }, [handlePointer])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  return (
    <div
      ref={sliderRef}
      className="relative w-full h-3 rounded-full cursor-pointer select-none touch-none"
      style={{
        background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="absolute top-1/2 w-4 h-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_1px_3px_rgba(0,0,0,0.3)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          left: `${(hue / 360) * 100}%`,
          backgroundColor: `hsl(${hue}, 100%, 50%)`,
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Opacity Slider
// ---------------------------------------------------------------------------
const OpacitySlider: React.FC<{
  color: string
  opacity: number
  onChange: (opacity: number) => void
}> = ({ color, opacity, onChange }) => {
  const sliderRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handlePointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    const rect = sliderRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onChange(Math.round(x * 100))
  }, [onChange])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    handlePointer(e)
  }, [handlePointer])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragging.current) handlePointer(e)
  }, [handlePointer])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  return (
    <div
      ref={sliderRef}
      className="relative w-full h-3 rounded-full cursor-pointer select-none touch-none"
      style={{
        background: `linear-gradient(to right, transparent, ${color})`,
        backgroundImage: `linear-gradient(to right, ${hexToRgba(color, 0)}, ${color}), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='4' height='4' fill='%23ccc'/%3E%3Crect x='4' y='4' width='4' height='4' fill='%23ccc'/%3E%3C/svg%3E")`,
        backgroundSize: '100% 100%, 8px 8px',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="absolute top-1/2 w-4 h-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_1px_3px_rgba(0,0,0,0.3)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          left: `${opacity}%`,
          backgroundColor: hexToRgba(color, opacity / 100),
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main ColorPicker Component
// ---------------------------------------------------------------------------
export interface ColorPickerProps {
  /** Current color value (hex format, e.g. "#3b82f6") */
  value?: string
  /** Callback when color changes */
  onChange?: (color: string) => void
  /** Preset color swatches */
  swatches?: string[]
  /** Show opacity slider */
  showOpacity?: boolean
  /** Callback to unset/clear color */
  onUnset?: () => void
  /** Trigger type: 'button' shows full button, 'toggle' shows icon toggle */
  trigger?: 'button' | 'toggle'
  /** Custom icon for the trigger */
  triggerIcon?: ReactNode
  /** Additional trigger class name */
  triggerClassName?: string
  /** Popover alignment */
  align?: 'start' | 'center' | 'end'
  /** Additional class name */
  className?: string
  /** Whether the picker is disabled */
  disabled?: boolean
}

export function ColorPicker({
  value = '#3b82f6',
  onChange,
  swatches = DEFAULT_SWATCHES,
  showOpacity = false,
  onUnset,
  trigger = 'toggle',
  triggerIcon,
  triggerClassName,
  align = 'start',
  className,
  disabled = false,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [hsb, setHsb] = useState<HSB>(() => hexToHsb(value || '#3b82f6'))
  const [opacity, setOpacity] = useState(100)
  const [hexInput, setHexInput] = useState(value || '#3b82f6')

  // Sync external value -> internal state
  useEffect(() => {
    if (value) {
      const normalized = value.startsWith('#') ? value : `#${value}`
      if (normalized.length === 7 || normalized.length === 9) {
        const baseHex = normalized.slice(0, 7)
        const newHsb = hexToHsb(baseHex)
        setHsb(newHsb)
        setHexInput(baseHex)
        if (normalized.length === 9) {
          const alphaHex = normalized.slice(7, 9)
          setOpacity(Math.round((parseInt(alphaHex, 16) / 255) * 100))
        }
      }
    }
  }, [value])

  const currentHex = useMemo(() => hsbToHex(hsb), [hsb])

  const emitColor = useCallback((hex: string, op: number) => {
    if (!onChange) return
    if (showOpacity && op < 100) {
      const alpha = Math.round(op * 2.55).toString(16).padStart(2, '0')
      onChange(`${hex}${alpha}`)
    } else {
      onChange(hex)
    }
  }, [onChange, showOpacity])

  const handleSatBrightChange = useCallback((s: number, b: number) => {
    const newHsb = { ...hsb, s, b }
    setHsb(newHsb)
    const hex = hsbToHex(newHsb)
    setHexInput(hex)
    emitColor(hex, opacity)
  }, [hsb, opacity, emitColor])

  const handleHueChange = useCallback((h: number) => {
    const newHsb = { ...hsb, h }
    setHsb(newHsb)
    const hex = hsbToHex(newHsb)
    setHexInput(hex)
    emitColor(hex, opacity)
  }, [hsb, opacity, emitColor])

  const handleOpacityChange = useCallback((op: number) => {
    setOpacity(op)
    emitColor(currentHex, op)
  }, [currentHex, emitColor])

  const handleHexInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value
    if (!val.startsWith('#')) val = `#${val}`
    setHexInput(val)
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      const newHsb = hexToHsb(val)
      setHsb(newHsb)
      emitColor(val, opacity)
    }
  }, [opacity, emitColor])

  const handleSwatchClick = useCallback((color: string) => {
    const newHsb = hexToHsb(color)
    setHsb(newHsb)
    setHexInput(color)
    emitColor(color, opacity)
  }, [opacity, emitColor])

  const triggerElement = trigger === 'button' ? (
    <Button
      variant="outline"
      disabled={disabled}
      className={cn(
        'w-[220px] justify-start text-left font-normal',
        !value && 'text-muted-foreground',
        triggerClassName
      )}
    >
      <div className="w-full flex items-center gap-2">
        {value ? (
          <div
            className="h-4 w-4 rounded !bg-center !bg-cover transition-all border border-black/10 dark:border-white/10"
            style={{ background: value }}
          />
        ) : (
          triggerIcon || <Paintbrush className="h-4 w-4" />
        )}
        <div className="truncate flex-1">
          {value || 'Pick a color'}
        </div>
      </div>
    </Button>
  ) : (
    <Toggle
      size="sm"
      pressed={false}
      disabled={disabled}
      className={triggerClassName}
    >
      {value ? (
        <div
          className="h-4 w-4 rounded !bg-center !bg-cover transition-all border border-black/10 dark:border-white/10"
          style={{ background: value }}
        />
      ) : (
        triggerIcon || <Paintbrush className="h-4 w-4" />
      )}
    </Toggle>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {triggerElement}
      </PopoverTrigger>
      <PopoverContent className={cn("w-64 p-3", className)} align={align} sideOffset={8}>
        <div className="space-y-3">
          {/* Saturation/Brightness Area */}
          <SaturationBrightnessArea
            hue={hsb.h}
            saturation={hsb.s}
            brightness={hsb.b}
            onChange={handleSatBrightChange}
          />

          {/* Hue Slider */}
          <HueSlider hue={hsb.h} onChange={handleHueChange} />

          {/* Opacity Slider */}
          {showOpacity && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Opacity</span>
                <span>{opacity}%</span>
              </div>
              <OpacitySlider color={currentHex} opacity={opacity} onChange={handleOpacityChange} />
            </div>
          )}

          {/* Hex Input */}
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-md border border-black/10 dark:border-white/10 flex-shrink-0"
              style={{ backgroundColor: showOpacity ? hexToRgba(currentHex, opacity / 100) : currentHex }}
            />
            <Input
              value={hexInput.toUpperCase()}
              onChange={handleHexInputChange}
              className="h-7 text-xs font-mono flex-1"
              placeholder="#000000"
            />
          </div>

          {/* Swatches */}
          {swatches.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
              {swatches.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={cn(
                    "w-5 h-5 rounded-md border border-black/10 dark:border-white/10 transition-transform hover:scale-110 relative",
                    currentHex.toLowerCase() === swatch.toLowerCase() && "ring-2 ring-primary ring-offset-1"
                  )}
                  style={{ backgroundColor: swatch }}
                  onClick={() => handleSwatchClick(swatch)}
                >
                  {currentHex.toLowerCase() === swatch.toLowerCase() && (
                    <CheckIcon className="w-3 h-3 absolute inset-0 m-auto text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Unset Color Button */}
          {onUnset && (
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1.5 rounded-md hover:bg-muted transition-colors"
              onClick={() => { onUnset(); setOpen(false) }}
            >
              <X className="h-3 w-3" />
              Remove Color
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Deprecated: Legacy API Wrapper
// Keeps backward compatibility with the old (background, setBackground) API.
// ---------------------------------------------------------------------------
/** @deprecated Use the new ColorPicker with value/onChange API instead. */
export function ColorPickerLegacy({
  background,
  setBackground,
  className,
  simple = false,
  handleUnSet,
  icon,
}: {
  background: string
  setBackground: (background: string) => void
  className?: string
  simple?: boolean
  handleUnSet?: () => void
  icon?: ReactNode
}) {
  return (
    <ColorPicker
      value={background}
      onChange={setBackground}
      trigger={simple ? 'toggle' : 'button'}
      triggerIcon={icon}
      onUnset={handleUnSet}
      className={className}
    />
  )
}
