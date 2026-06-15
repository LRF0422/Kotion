import React from "react"
import { useIsMobile as useIsMobileCanonical } from "./use-mobile"

export const useMediaQuery = (query: string) => {
    // Lazy sync init so the first render already reflects the real match —
    // avoids a flash from a hard-coded `false` initial value.
    const [value, setValue] = React.useState(
        () => typeof window !== "undefined" && window.matchMedia(query).matches
    )

    React.useEffect(() => {
        function onChange(event: MediaQueryListEvent) {
            setValue(event.matches)
        }

        const result = matchMedia(query)
        result.addEventListener("change", onChange)
        setValue(result.matches)

        return () => result.removeEventListener("change", onChange)
    }, [query])

    return value
}

// Re-export the canonical implementation so there's a single source of truth.
export const useIsMobile = useIsMobileCanonical
