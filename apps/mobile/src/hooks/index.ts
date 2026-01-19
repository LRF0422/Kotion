export { useResponsive } from './useResponsive';
export type { ResponsiveState, Breakpoint, Orientation } from './useResponsive';

export { useViewport, detectViewportSize, isPortrait, getViewportDimensions } from './useViewport';
export type { ViewportSize } from './useViewport';

export { useTouch } from './useTouch';
export type { TouchPosition, TouchState, UseTouchOptions } from './useTouch';

export {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useIsTouchDevice,
  useIsLandscape,
  useIsPortrait,
  usePrefersReducedMotion,
  usePrefersDarkMode,
} from './useMediaQuery';
