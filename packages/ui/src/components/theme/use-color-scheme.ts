import { useSyncExternalStore } from "react"
import {
    ColorScheme,
    PRESETS,
    ThemePreset,
    getColorScheme,
    setColorScheme,
    subscribe,
} from "./color-scheme"

/**
 * React binding for the color-scheme engine. Returns the current scheme, the available
 * presets, and a setter. Any change re-renders all consumers and (via ThemeProvider's
 * subscription) re-applies the palette globally.
 */
export function useColorScheme(): {
    scheme: ColorScheme
    presets: ThemePreset[]
    setScheme: (next: ColorScheme) => void
} {
    const scheme = useSyncExternalStore(subscribe, getColorScheme, getColorScheme)
    return { scheme, presets: PRESETS, setScheme: setColorScheme }
}
