import * as React from "react"
import { DeviceType, getDeviceType } from "./breakpoints"

/**
 * Context populated by `ResponsiveProvider`. When present, every `useResponsive`
 * consumer shares a single resize listener. When absent (e.g. a plugin rendered
 * outside the provider), the hook falls back to its own listener so it still works.
 */
export const ResponsiveContext = React.createContext<DeviceType | null>(null)

function readDevice(): DeviceType {
    if (typeof window === "undefined") return "desktop"
    return getDeviceType(window.innerWidth)
}

/** Internal: subscribe to viewport changes and track the device tier.
 *  `enabled` is false when a ResponsiveProvider already supplies the value, so
 *  we avoid attaching a redundant listener per consumer. */
function useDeviceTypeSelfManaged(enabled: boolean): DeviceType {
    const [device, setDevice] = React.useState<DeviceType>(readDevice)

    React.useEffect(() => {
        if (!enabled) return
        const onResize = () => {
            setDevice((prev) => {
                const next = getDeviceType(window.innerWidth)
                return prev === next ? prev : next
            })
        }
        window.addEventListener("resize", onResize)
        onResize()
        return () => window.removeEventListener("resize", onResize)
    }, [enabled])

    return device
}

export interface ResponsiveState {
    device: DeviceType
    isMobile: boolean
    isTablet: boolean
    isDesktop: boolean
    /** mobile OR tablet — i.e. touch-first / narrow layouts. */
    isMobileOrTablet: boolean
    /** tablet OR desktop — i.e. has room for desktop-style chrome. */
    isTabletOrDesktop: boolean
}

function toState(device: DeviceType): ResponsiveState {
    return {
        device,
        isMobile: device === "mobile",
        isTablet: device === "tablet",
        isDesktop: device === "desktop",
        isMobileOrTablet: device !== "desktop",
        isTabletOrDesktop: device !== "mobile",
    }
}

/**
 * The canonical responsive hook. Returns the current device tier plus
 * convenience booleans. Prefer this over ad-hoc `matchMedia` in app/plugin code.
 *
 * Reuse note: for cosmetic changes (columns, spacing, font size, show/hide)
 * prefer Tailwind `md:`/`lg:` prefixes; reach for this hook only when the
 * component *tree* or interaction differs per device.
 */
export function useResponsive(): ResponsiveState {
    const ctxDevice = React.useContext(ResponsiveContext)
    const selfDevice = useDeviceTypeSelfManaged(ctxDevice === null)
    const device = ctxDevice ?? selfDevice
    return React.useMemo(() => toState(device), [device])
}
