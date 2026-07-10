import { useEffect, useState } from "react"
import { useTheme } from "./index"
import type { ResolvedMode } from "./color-scheme"

/**
 * Resolves the user's theme preference ("light" | "dark" | "system") to the
 * actual currently-active mode ("light" | "dark").
 *
 * When the theme is "system", this hook listens to `prefers-color-scheme`
 * media query changes and re-renders on OS dark/light switches.
 *
 * Use this instead of `useTheme().theme === "dark"` — the latter does NOT
 * resolve "system" and will always return false when the user hasn't
 * explicitly picked "dark".
 */
export function useResolvedTheme(): ResolvedMode {
    const { theme } = useTheme()

    const [resolved, setResolved] = useState<ResolvedMode>(() => {
        if (theme === "system") {
            if (typeof window === "undefined") return "light"
            return window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light"
        }
        return theme
    })

    useEffect(() => {
        if (theme !== "system") {
            setResolved(theme)
            return
        }

        const mql = window.matchMedia("(prefers-color-scheme: dark)")
        setResolved(mql.matches ? "dark" : "light")

        const onChange = (e: MediaQueryListEvent) =>
            setResolved(e.matches ? "dark" : "light")
        mql.addEventListener("change", onChange)
        return () => mql.removeEventListener("change", onChange)
    }, [theme])

    return resolved
}
