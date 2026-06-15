/**
 * Single source of truth for the responsive device tiers.
 *
 * Aligned with the Tailwind `md` (768) and `lg` (1024) breakpoints so JS device
 * logic and CSS utility prefixes never disagree:
 *   mobile  : < 768px        (phones — bottom tab bar, thumb-first)
 *   tablet  : 768px – 1023px (desktop-style chrome, collapsible side panels)
 *   desktop : >= 1024px      (full multi-column layout)
 */
export const BREAKPOINTS = {
    tablet: 768,
    desktop: 1024,
} as const

export type DeviceType = "mobile" | "tablet" | "desktop"

/** Back-compat: the original mobile/desktop split used `768`. */
export const MOBILE_BREAKPOINT = BREAKPOINTS.tablet

/** Derive the device tier from a viewport width in CSS px. */
export function getDeviceType(width: number): DeviceType {
    if (width < BREAKPOINTS.tablet) return "mobile"
    if (width < BREAKPOINTS.desktop) return "tablet"
    return "desktop"
}
