import * as React from "react"
import { ResponsiveContext } from "../../hooks/use-responsive"
import { DeviceType, getDeviceType } from "../../hooks/breakpoints"

function readDevice(): DeviceType {
    if (typeof window === "undefined") return "desktop"
    return getDeviceType(window.innerWidth)
}

/**
 * Provides the current device tier to all `useResponsive` consumers through a
 * single, app-wide resize listener (instead of one per hook call).
 *
 * Also mirrors the tier onto `<html data-device="…">` so CSS can target a tier
 * directly when a Tailwind prefix isn't enough — e.g. `html[data-device="tablet"] .x{}`.
 *
 * Mount once near the app root (inside ThemeProvider, outside the Redux store).
 */
export const ResponsiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [device, setDevice] = React.useState<DeviceType>(readDevice)

    React.useEffect(() => {
        const onResize = () => {
            setDevice((prev) => {
                const next = getDeviceType(window.innerWidth)
                return prev === next ? prev : next
            })
        }
        window.addEventListener("resize", onResize)
        onResize()
        return () => window.removeEventListener("resize", onResize)
    }, [])

    React.useEffect(() => {
        if (typeof document !== "undefined") {
            document.documentElement.dataset.device = device
        }
    }, [device])

    return (
        <ResponsiveContext.Provider value={device}>
            {children}
        </ResponsiveContext.Provider>
    )
}
