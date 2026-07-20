import React, { useState, useCallback, useEffect } from "react"
import { cn } from "@ui/lib/utils"
import { ColorPicker } from "./color-picker"

interface ColorInputProps {
  onChange?: (color: string) => void
  defaultValue?: string
  swatches?: string[]
  showOpacity?: boolean
  label?: string
  className?: string
  id?: string
}

const defaultSwatches = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
]

/**
 * ColorInput — a simple inline color picker control.
 * Internally delegates to the unified ColorPicker component.
 */
function ColorInput({
  onChange,
  defaultValue = "#3b82f6",
  swatches = defaultSwatches,
  showOpacity = true,
  label = "Color",
  id,
  className
}: ColorInputProps) {
  const [color, setColor] = useState(defaultValue)

  const handleChange = useCallback((newColor: string) => {
    setColor(newColor)
    onChange?.(newColor)
  }, [onChange])

  useEffect(() => {
    setColor(defaultValue)
  }, [defaultValue])

  return (
    <div id={id} className={cn("w-full max-w-xs", className)}>
      <ColorPicker
        value={color}
        onChange={handleChange}
        swatches={swatches}
        showOpacity={showOpacity}
        trigger="button"
        align="start"
      />
    </div>
  )
}

export { ColorInput }
export type { ColorInputProps }
