import * as React from "react"

export interface VirtualKeyboardState {
  /** Height in CSS px the on-screen keyboard currently overlaps the layout viewport. */
  keyboardHeight: number
  /** Whether the on-screen keyboard is considered open. */
  isOpen: boolean
}

// Threshold below which a viewport shrink is treated as noise (browser chrome,
// rotation rounding) rather than a keyboard opening.
const OPEN_THRESHOLD = 120

/**
 * Tracks the on-screen (virtual) keyboard using the `visualViewport` API.
 *
 * On mobile browsers the soft keyboard shrinks the visual viewport without
 * resizing the layout viewport, so `window.innerHeight` alone can't detect it.
 * We compare the layout viewport height against `visualViewport.height` (plus
 * its offsetTop) to derive how much the keyboard overlaps the bottom.
 *
 * Returns `{ keyboardHeight, isOpen }`. Use `keyboardHeight` to dock a toolbar
 * above the keyboard (`bottom: keyboardHeight`).
 */
export function useVirtualKeyboard(): VirtualKeyboardState {
  const [state, setState] = React.useState<VirtualKeyboardState>({
    keyboardHeight: 0,
    isOpen: false,
  })

  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined
    if (!vv) return

    const update = () => {
      // Bottom area covered by the keyboard = how much the visual viewport's
      // bottom sits above the layout viewport's bottom.
      const overlap = window.innerHeight - vv.height - vv.offsetTop
      const keyboardHeight = Math.max(0, Math.round(overlap))
      const isOpen = keyboardHeight > OPEN_THRESHOLD
      setState((prev) =>
        prev.keyboardHeight === (isOpen ? keyboardHeight : 0) && prev.isOpen === isOpen
          ? prev
          : { keyboardHeight: isOpen ? keyboardHeight : 0, isOpen }
      )
    }

    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
    }
  }, [])

  return state
}
