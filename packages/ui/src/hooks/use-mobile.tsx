import { useResponsive } from "./use-responsive"
import { MOBILE_BREAKPOINT } from "./breakpoints"

export { MOBILE_BREAKPOINT }

/**
 * Back-compat wrapper around the three-tier {@link useResponsive}. Returns true
 * only for the mobile tier (< 768px); tablet and desktop are both false — which
 * matches "tablet uses desktop-style chrome". Prefer `useResponsive()` in new code.
 */
export function useIsMobile(): boolean {
    return useResponsive().isMobile
}
