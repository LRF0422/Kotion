import type { DesktopBridge } from "../core/desktop-bridge";
import { useOptionalService } from "../hooks/use-service";
import { resolveOptionalService } from "./service-resolver";

/** Desktop capability bridge, or undefined on the web / when unavailable. */
export const useDesktop = (): DesktopBridge | undefined => useOptionalService("desktop");

/** Imperative counterpart of useDesktop for non-React code. */
export const resolveDesktop = (): DesktopBridge | undefined => resolveOptionalService("desktop");
