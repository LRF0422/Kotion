export type UiStyle = "classic" | "modern"

export const UI_STYLE_STORAGE_KEY = "kn-ui-style"
export const DEFAULT_UI_STYLE: UiStyle = "classic"

function isUiStyle(value: string | null): value is UiStyle {
    return value === "classic" || value === "modern"
}

function readStorage(): UiStyle {
    if (typeof window === "undefined") return DEFAULT_UI_STYLE

    try {
        const stored = window.localStorage.getItem(UI_STYLE_STORAGE_KEY)
        return isUiStyle(stored) ? stored : DEFAULT_UI_STYLE
    } catch {
        return DEFAULT_UI_STYLE
    }
}

let current: UiStyle = readStorage()
const listeners = new Set<() => void>()

export function getUiStyle(): UiStyle {
    return current
}

export function applyUiStyle(style: UiStyle = current): void {
    if (typeof document === "undefined") return
    const root = document.documentElement
    if (root.dataset.uiStyle !== style) root.dataset.uiStyle = style
}

export function setUiStyle(next: UiStyle): void {
    if (current === next) {
        applyUiStyle(next)
        return
    }

    current = next
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(UI_STYLE_STORAGE_KEY, next)
        } catch {
            // Storage may be unavailable; keep the preference for this session.
        }
    }

    applyUiStyle(next)
    listeners.forEach((listener) => listener())
}

export function subscribeUiStyle(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}
