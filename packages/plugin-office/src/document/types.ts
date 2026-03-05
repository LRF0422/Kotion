export interface DocumentAttrs {
    /** Univer IDocumentData snapshot, null for a fresh document */
    documentData: Record<string, any> | null
    /** Block height in pixels */
    height: number
}