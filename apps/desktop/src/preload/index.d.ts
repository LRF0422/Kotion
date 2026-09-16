// Types for the narrow desktop capability bridge exposed by the preload script.
// Plugins must NOT use this global directly; they consume the `desktop` service
// from @kn/common (useOptionalService("desktop") / resolveOptionalService).

interface DesktopHostBridge {
  platform: string
  capabilities: readonly string[]
  invoke(capability: string, params?: unknown): Promise<unknown>
  on(event: string, listener: (value: unknown) => void): () => void
}

declare global {
  interface Window {
    knDesktop?: DesktopHostBridge
  }
}

export { }
