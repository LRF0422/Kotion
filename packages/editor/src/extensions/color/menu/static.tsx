import { BaselineIcon, X } from "@kn/icon"
import {
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
  cn,
  useTheme
} from "@kn/ui"
import { Editor } from "@tiptap/react"
import React, { useCallback, useState, useMemo, useRef } from "react"
import { TEXT_COLORS, TextColorName, TextColor } from "../index"

interface TextColorItemProps {
  name: TextColorName
  color: string
  isActive: boolean
  onClick: () => void
}

const TextColorItem: React.FC<TextColorItemProps> = ({
  name,
  color,
  isActive,
  onClick
}) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              "w-7 h-7 rounded-md transition-all duration-150 flex items-center justify-center",
              "hover:scale-110 hover:shadow-md",
              "focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary/50",
              "border border-black/10 dark:border-white/10",
              isActive && "ring-2 ring-primary ring-offset-1"
            )}
            style={{ backgroundColor: color }}
            onClick={onClick}
            aria-label={`Text color ${name}`}
          >
            <span
              className="text-xs font-medium text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]"
            >
              A
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs capitalize">
          {name.replace('-', ' ')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Helper to find color config by color value
const findColorByValue = (color: string | null): TextColor | undefined => {
  if (!color) return undefined
  return TEXT_COLORS.find(c =>
    c.light === color || c.dark === color
  )
}

// Number of default (saturated) shades before the light shades start
const DEFAULT_SHADE_COUNT = 12

export const ColorStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const [open, setOpen] = useState(false)
  const [customColor, setCustomColor] = useState('')
  const { theme } = useTheme()
  const nativePickerRef = useRef<HTMLInputElement>(null)

  const isDark = useMemo(() => {
    if (theme === 'dark') return true
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  }, [theme])

  const currentColor = editor.getAttributes('textStyle').color || null
  const isColorActive = editor.isActive('textStyle') && !!currentColor

  const currentColorConfig = findColorByValue(currentColor)

  // Split colors into two rows: default shades and light shades
  const defaultShades = TEXT_COLORS.slice(0, DEFAULT_SHADE_COUNT)
  const lightShades = TEXT_COLORS.slice(DEFAULT_SHADE_COUNT)

  const handleSetColor = useCallback((colorConfig: TextColor) => {
    editor.chain().focus().setColor(colorConfig.light).run()
    setOpen(false)
  }, [editor])

  const handleSetCustomColor = useCallback((color: string) => {
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      editor.chain().focus().setColor(color).run()
      setOpen(false)
    }
  }, [editor])

  const handleCustomColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCustomColor(value)
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      editor.chain().focus().setColor(value).run()
    }
  }, [editor])

  const handleNativeColorPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCustomColor(value)
    editor.chain().focus().setColor(value).run()
  }, [editor])

  const handleUnsetColor = useCallback(() => {
    editor.chain().focus().unsetColor().run()
    setOpen(false)
  }, [editor])

  // Check if the current color is a preset
  const isPresetColor = currentColorConfig !== undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Toggle
          size="sm"
          pressed={isColorActive}
          className="relative"
        >
          <BaselineIcon
            className="h-4 w-4"
            style={currentColor ? { color: isDark ? (currentColorConfig?.dark || currentColor) : currentColor } : undefined}
          />
          {currentColorConfig && (
            <span
              className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-1 rounded-full"
              style={{
                backgroundColor: isDark
                  ? currentColorConfig.dark
                  : currentColorConfig.light
              }}
            />
          )}
        </Toggle>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-3"
        align="start"
        sideOffset={8}
      >
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">
            Text Color
          </div>

          {/* Default (saturated) shades */}
          <div className="grid grid-cols-6 gap-1.5">
            {defaultShades.map((colorConfig) => {
              const themeColor = isDark ? colorConfig.dark : colorConfig.light
              return (
                <TextColorItem
                  key={colorConfig.name}
                  name={colorConfig.name}
                  color={themeColor}
                  isActive={currentColor === colorConfig.light}
                  onClick={() => handleSetColor(colorConfig)}
                />
              )
            })}
          </div>

          {/* Light (pastel) shades */}
          <div className="grid grid-cols-6 gap-1.5">
            {lightShades.map((colorConfig) => {
              const themeColor = isDark ? colorConfig.dark : colorConfig.light
              return (
                <TextColorItem
                  key={colorConfig.name}
                  name={colorConfig.name}
                  color={themeColor}
                  isActive={currentColor === colorConfig.light}
                  onClick={() => handleSetColor(colorConfig)}
                />
              )
            })}
          </div>

          {/* Custom color input */}
          <div className="flex items-center gap-2 pt-1 border-t border-border">
            <div className="relative">
              <button
                className="w-7 h-7 rounded-md border border-black/10 dark:border-white/10 cursor-pointer overflow-hidden"
                style={{ backgroundColor: currentColor && !isPresetColor ? currentColor : (customColor || '#3b82f6') }}
                onClick={() => nativePickerRef.current?.click()}
                aria-label="Open color picker"
              >
                <input
                  ref={nativePickerRef}
                  type="color"
                  value={currentColor && !isPresetColor ? currentColor : (customColor || '#3b82f6')}
                  onChange={handleNativeColorPick}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  tabIndex={-1}
                />
              </button>
            </div>
            <Input
              placeholder="#000000"
              value={customColor || (currentColor && !isPresetColor ? currentColor : '')}
              onChange={handleCustomColorChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = customColor || (currentColor && !isPresetColor ? currentColor : '')
                  handleSetCustomColor(val)
                }
              }}
              className="h-7 text-xs font-mono flex-1"
            />
          </div>

          {isColorActive && (
            <button
              className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1.5 rounded-md hover:bg-muted transition-colors"
              onClick={handleUnsetColor}
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
