import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { applyColorScheme, subscribe, ResolvedMode } from "./color-scheme"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
    children: React.ReactNode
    defaultTheme?: Theme
    storageKey?: string
}

type ThemeProviderState = {
    theme: Theme
    setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
    theme: "system",
    setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
    children,
    defaultTheme = "system",
    storageKey = "vite-ui-theme",
    ...props
}: ThemeProviderProps) {
    const [theme, setTheme] = useState<Theme>(
        () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
    )

    // Track the currently resolved light/dark mode so the color-scheme subscription
    // can re-apply the right (light vs dark) palette without recomputing the mode.
    const resolvedModeRef = useRef<ResolvedMode>("light")

    useEffect(() => {
        const root = window.document.documentElement

        const apply = (mode: ResolvedMode) => {
            root.classList.remove("light", "dark")
            root.classList.add(mode)
            resolvedModeRef.current = mode
            // Re-apply the active color scheme for the resolved mode (inline CSS vars
            // win over globals.css). Pairs with the subscription effect below.
            applyColorScheme(mode)
        }

        if (theme === "system") {
            const mql = window.matchMedia("(prefers-color-scheme: dark)")
            apply(mql.matches ? "dark" : "light")
            // Follow OS changes while in "system" mode.
            const onChange = (e: MediaQueryListEvent) => apply(e.matches ? "dark" : "light")
            mql.addEventListener("change", onChange)
            return () => mql.removeEventListener("change", onChange)
        }

        apply(theme)
    }, [theme])

    // Re-apply when the color scheme (preset / accent) changes from the settings UI.
    useEffect(() => {
        return subscribe(() => applyColorScheme(resolvedModeRef.current))
    }, [])

    const setThemeStable = useCallback((newTheme: Theme) => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(storageKey, newTheme)
        }
        setTheme(newTheme)
    }, [storageKey])

    const value = useMemo(() => ({
        theme,
        setTheme: setThemeStable,
    }), [theme, setThemeStable])

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    )
}

// Re-export the color-scheme engine + hook so they ship as part of `@kn/ui`
// (@kn/ui → ./components → ./theme).
export * from "./color-scheme"
export * from "./use-color-scheme"

export const useTheme = () => {
    const context = useContext(ThemeProviderContext)

    if (context === undefined)
        throw new Error("useTheme must be used within a ThemeProvider")

    return context
}