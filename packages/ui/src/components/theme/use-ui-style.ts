import { useSyncExternalStore } from "react"
import { getUiStyle, setUiStyle, subscribeUiStyle, UiStyle } from "./ui-style"

export function useUiStyle(): {
    uiStyle: UiStyle
    setUiStyle: (style: UiStyle) => void
} {
    const uiStyle = useSyncExternalStore(subscribeUiStyle, getUiStyle, getUiStyle)
    return { uiStyle, setUiStyle }
}
