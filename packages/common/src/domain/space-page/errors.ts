/**
 * Business error codes returned by the knowledge-wiki backend (`WikiException`).
 *
 * The request layer keeps the backend's business code on rejected errors (the
 * platform translator returns HTTP 400 + the original code), so callers can
 * branch on behavior without parsing localized messages.
 */
export const PAGE_IN_TRASH_ERROR_CODE = 3017

/**
 * True when a failed page call was rejected because the page is in the trash.
 * A page that is deleted — or that sits in a live row under a trashed parent —
 * is refused by the backend with this code, which lets the editor render a
 * "restore to open" state instead of a dead end.
 */
export const isPageInTrashError = (error: unknown): boolean => {
    if (!error || typeof error !== "object") return false
    return (error as { code?: unknown }).code === PAGE_IN_TRASH_ERROR_CODE
}
