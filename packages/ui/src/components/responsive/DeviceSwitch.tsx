import * as React from "react"
import { useResponsive } from "../../hooks/use-responsive"

/**
 * Pick the slot matching the current device tier, with sensible cascade
 * fallback so you only provide the slots you care about:
 *   - tablet missing  → falls back to desktop, then mobile
 *   - mobile missing  → falls back to tablet, then desktop
 *   - desktop missing → falls back to tablet, then mobile
 *
 * One declarative element replaces nested `isMobile ? … : isTablet ? … : …`.
 *
 * ```tsx
 * <DeviceSwitch
 *   mobile={<BottomSheetNav />}
 *   desktop={<SidebarNav />}   // tablet auto-falls back to desktop
 * />
 * ```
 */
export const DeviceSwitch: React.FC<{
    mobile?: React.ReactNode
    tablet?: React.ReactNode
    desktop?: React.ReactNode
    /** Rendered only if no slot resolves (all undefined). */
    fallback?: React.ReactNode
}> = ({ mobile, tablet, desktop, fallback = null }) => {
    const { device } = useResponsive()

    const order: Record<typeof device, React.ReactNode[]> = {
        mobile: [mobile, tablet, desktop],
        tablet: [tablet, desktop, mobile],
        desktop: [desktop, tablet, mobile],
    }

    const resolved = order[device].find((slot) => slot !== undefined)
    return <>{resolved ?? fallback}</>
}
