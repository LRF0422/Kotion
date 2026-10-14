/**
 * Input-method (IME) guard for "Enter submits" inputs.
 *
 * While a composition is in flight — typing 拼音 / かな / 한글 — Enter means
 * "confirm the candidate", and the browser fires the very same keydown we would
 * otherwise treat as a submit. Submitting there sends the raw pre-edit text
 * ("nihao") instead of the characters the user picked (你好), so every
 * Enter-to-submit input must ignore key events that belong to a composition.
 *
 * `isComposing` is the standard flag; `keyCode === 229` covers the browsers (and
 * older Safari) that report the composition keystroke without setting it.
 */
export function isImeComposing(
    event: {
        nativeEvent?: { isComposing?: boolean; keyCode?: number }
        isComposing?: boolean
        keyCode?: number
    } | null | undefined,
): boolean {
    if (!event) return false
    const native = event.nativeEvent
    // Prefer the native flag/keyCode: a React synthetic event mirrors it, but a
    // native listener (or a synthetic event created by a test) may only fill one.
    const composing = native?.isComposing ?? event.isComposing
    const keyCode = native?.keyCode ?? event.keyCode
    return composing === true || keyCode === 229
}
