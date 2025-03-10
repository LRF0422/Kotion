import { useState } from "react"
import { cn } from "@ui/lib/utils"
import { useCopyToClipboard } from "@ui/hooks/use-copy-to-clipboard"
import { CheckIcon, CopyIcon } from "@repo/icon"
import React from "react"

interface ColorInputProps {
  onChange?: (color: string) => void // Callback for final color
  defaultValue?: string // Default color
  swatches?: string[] // Swatches for quick selection
  showOpacity?: boolean // Whether to show the opacity slider
  label?: string // Label for the input
  className?: string,
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
  "transparent"
]

// Helper to calculate final color with opacity
const generateFinalColor = (color: string, opacity: number): string => {
  if (opacity === 100) return color // No need to calculate if opacity is 100%
  const alpha = Math.round(opacity * 2.55) // Convert opacity (0-100) to 0-255
    .toString(16) // Convert to hexadecimal
    .padStart(2, "0") // Ensure 2 digits (e.g., "0F")
  return `${color}${alpha}`
}

function ColorInput({
  onChange,
  defaultValue = "#3b82f6",
  swatches = defaultSwatches,
  showOpacity = true,
  label = "Color",
  id,
  className
}: ColorInputProps) {
  const [color, setColor] = useState(defaultValue) // Base color without opacity
  const [opacity, setOpacity] = useState(100) // Opacity (0-100)
  const [copiedText, copy] = useCopyToClipboard()

  const finalColor = generateFinalColor(color, opacity) // Calculate the final color

  // Trigger the onChange callback whenever color or opacity changes
  const updateFinalColor = (newColor: string, newOpacity = opacity) => {
    const updatedColor = generateFinalColor(newColor, newOpacity)
    setColor(newColor)
    onChange?.(updatedColor) // Pass final color to parent
  }

  const updateOpacity = (newOpacity: number) => {
    setOpacity(newOpacity)
    onChange?.(generateFinalColor(color, newOpacity)) // Pass final color to parent
  }

  const handleCopy = async () => {
    await copy(finalColor)
  }

  return (
    <div id={id} className={cn("w-full max-w-xs space-y-2 relative z-10 min-h-[200px]", className)}>
      {/* Color Picker */}
      <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
        {/* Color Preview & Input */}
        <div className="flex gap-2 items-center">
          <div
            className="w-8 h-8 rounded-md border border-zinc-200 dark:border-zinc-700"
            style={{ backgroundColor: finalColor }} // Display final color
          />
          <input
            id="color-input"
            type="text"
            value={finalColor.toUpperCase()} // Show final color
            onChange={(e) => {
              const value = e.target.value.slice(0, 7) // Extract base color
              if (/^#[0-9A-F]{6}$/i.test(value)) {
                updateFinalColor(value)
              }
            }}
            className={cn(
              "flex-1 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800",
              "bg-white dark:bg-zinc-900 text-sm font-mono",
              "focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
            )}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="ml-2 hover:opacity-70"
          >
            {copiedText === finalColor ? (
              <CheckIcon className="w-4 h-4 text-green-500" />
            ) : (
              <CopyIcon className="w-4 h-4 text-zinc-500" />
            )}
          </button>
        </div>

        {/* Opacity Slider */}
        {showOpacity && (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span>Opacity</span>
              <span>{opacity}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={opacity}
              onChange={(e) => updateOpacity(Number(e.target.value))}
              className={cn(
                "w-full h-2 rounded-full appearance-none",
                "bg-gradient-to-r from-transparent to-current cursor-pointer",
                "dark:bg-gradient-to-r dark:from-zinc-800 dark:to-current",
                // Thumb styles for webkit
                "[&::-webkit-slider-thumb]:appearance-none",
                "[&::-webkit-slider-thumb]:w-4",
                "[&::-webkit-slider-thumb]:h-4",
                "[&::-webkit-slider-thumb]:rounded-full",
                "[&::-webkit-slider-thumb]:border-2",
                "[&::-webkit-slider-thumb]:border-white",
                "[&::-webkit-slider-thumb]:dark:border-zinc-900",
                "[&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(255,255,255,0.9),0_2px_5px_rgba(0,0,0,0.1)]",
                "[&::-webkit-slider-thumb]:dark:shadow-[0_0_0_4px_rgba(0,0,0,0.9),0_2px_5px_rgba(0,0,0,0.5)]",
                "[&::-webkit-slider-thumb]:hover:scale-110",
                "[&::-webkit-slider-thumb]:transition-all",
                // Thumb styles for firefox
                "[&::-moz-range-thumb]:appearance-none",
                "[&::-moz-range-thumb]:w-4",
                "[&::-moz-range-thumb]:h-4",
                "[&::-moz-range-thumb]:rounded-full",
                "[&::-moz-range-thumb]:border-2",
                "[&::-moz-range-thumb]:border-white",
                "[&::-moz-range-thumb]:dark:border-zinc-900",
                "[&::-moz-range-thumb]:shadow-[0_0_0_4px_rgba(255,255,255,0.9),0_2px_5px_rgba(0,0,0,0.1)]",
                "[&::-moz-range-thumb]:dark:shadow-[0_0_0_4px_rgba(0,0,0,0.9),0_2px_5px_rgba(0,0,0,0.5)]",
                "[&::-moz-range-thumb]:hover:scale-110",
                "[&::-moz-range-thumb]:transition-all",
              )}
              style={{
                color,
                ["--thumb-color" as string]: color,
                ["--webkit-slider-thumb-background" as string]: color,
                ["--moz-range-thumb-background" as string]: color,
                background: `linear-gradient(to right, ${document.documentElement.classList.contains("dark")
                  ? "#27272a"
                  : "transparent"
                  }, ${color})`,
              }}
            />
            <style>{`
              input[type="range"]::-webkit-slider-thumb {
                background-color: var(--thumb-color);
              }
              input[type="range"]::-moz-range-thumb {
                background-color: var(--thumb-color);
              }
              @media (prefers-color-scheme: dark) {
                input[type="range"] {
                  background: linear-gradient(
                    to right,
                    #27272a,
                    var(--thumb-color)
                  );
                }
              }
            `}</style>
          </div>
        )}

        {/* Color Swatches */}
        <div className="mt-4 space-y-1.5">
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Swatches
          </div>
          <div className="grid grid-cols-6 gap-1">
            {swatches.map((swatch) => (
              <button
                type="button"
                key={swatch}
                onClick={() => updateFinalColor(swatch)}
                className={cn(
                  "w-6 h-6 rounded-md border border-zinc-200 dark:border-zinc-700",
                  "transition-transform hover:scale-110 relative",
                )}
                style={{ backgroundColor: swatch }}
              >
                {color === swatch && (
                  <CheckIcon
                    className={cn(
                      "w-4 h-4 absolute inset-0 m-auto text-white",
                      "drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]",
                    )}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export { ColorInput }
