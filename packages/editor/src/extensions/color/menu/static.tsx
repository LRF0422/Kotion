import { BaselineIcon } from "@kn/icon"
import {
  ColorPicker,
  Toggle,
  useTheme
} from "@kn/ui"
import { Editor } from "@tiptap/react"
import React, { useCallback, useMemo } from "react"
import { TEXT_COLORS } from "../index"

export const ColorStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const { theme } = useTheme()

  const isDark = useMemo(() => {
    if (theme === 'dark') return true
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  }, [theme])

  const currentColor = editor.getAttributes('textStyle').color || ''

  // Build swatches from TEXT_COLORS (use light theme values as canonical hex)
  const swatches = useMemo(() =>
    TEXT_COLORS.map(c => isDark ? c.dark : c.light),
    [isDark]
  )

  const handleChange = useCallback((color: string) => {
    editor.chain().focus().setColor(color).run()
  }, [editor])

  const handleUnset = useCallback(() => {
    editor.chain().focus().unsetColor().run()
  }, [editor])

  return (
    <ColorPicker
      value={currentColor || '#000000'}
      onChange={handleChange}
      onUnset={handleUnset}
      swatches={swatches}
      trigger="toggle"
      triggerIcon={
        <BaselineIcon
          className="h-4 w-4"
          style={currentColor ? { color: currentColor } : undefined}
        />
      }
      align="start"
    />
  )
}
