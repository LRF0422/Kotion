import { Highlighter, X } from "@kn/icon"
import {
    Button,
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
import { Editor } from "@tiptap/core"
import React, { useCallback, useState, useMemo } from "react"
import { HIGHLIGHT_COLORS, HighlightColorName, HighlightColor } from "./index"

interface HighlightColorItemProps {
    name: HighlightColorName
    bgColor: string
    textColor: string
    isActive: boolean
    onClick: () => void
}

const HighlightColorItem: React.FC<HighlightColorItemProps> = ({
    name,
    bgColor,
    textColor,
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
                        style={{ backgroundColor: bgColor }}
                        onClick={onClick}
                        aria-label={`Highlight ${name}`}
                    >
                        <span
                            className="text-xs font-medium"
                            style={{ color: textColor }}
                        >
                            A
                        </span>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs capitalize">
                    {name}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

// Helper to find color config by background color
const findColorByBg = (bgColor: string | null): HighlightColor | undefined => {
    if (!bgColor) return undefined
    return HIGHLIGHT_COLORS.find(c =>
        c.light.bg === bgColor || c.dark.bg === bgColor
    )
}

export const HighlightStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const [open, setOpen] = useState(false)
    const { theme } = useTheme()

    // Determine if we're in dark mode
    const isDark = useMemo(() => {
        if (theme === 'dark') return true
        if (theme === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches
        }
        return false
    }, [theme])

    const currentColor = editor.getAttributes('highlight').color || null
    const isHighlightActive = editor.isActive('highlight')

    // Find current color config to show the appropriate preview
    const currentColorConfig = findColorByBg(currentColor)

    const setHighlight = useCallback((colorConfig: HighlightColor) => {
        // Store the light mode color as the canonical value
        // CSS will handle the visual adaptation based on theme
        editor.chain().focus().setHighlight({ color: colorConfig.light.bg }).run()
        setOpen(false)
    }, [editor])

    const removeHighlight = useCallback(() => {
        editor.chain().focus().unsetHighlight().run()
        setOpen(false)
    }, [editor])

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Toggle
                    size="sm"
                    pressed={isHighlightActive}
                    className="relative"
                >
                    <Highlighter className="h-4 w-4" />
                    {currentColorConfig && (
                        <span
                            className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-1 rounded-full"
                            style={{
                                backgroundColor: isDark
                                    ? currentColorConfig.dark.bg
                                    : currentColorConfig.light.bg
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
                        Highlight Color
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        {HIGHLIGHT_COLORS.map((colorConfig) => {
                            const themeColors = isDark ? colorConfig.dark : colorConfig.light
                            return (
                                <HighlightColorItem
                                    key={colorConfig.name}
                                    name={colorConfig.name}
                                    bgColor={themeColors.bg}
                                    textColor={themeColors.text}
                                    isActive={currentColor === colorConfig.light.bg}
                                    onClick={() => setHighlight(colorConfig)}
                                />
                            )
                        })}
                    </div>
                    {isHighlightActive && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs text-muted-foreground hover:text-foreground"
                            onClick={removeHighlight}
                        >
                            <X className="h-3 w-3 mr-1" />
                            Remove Highlight
                        </Button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}
