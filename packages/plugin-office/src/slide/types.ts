export interface SlideAttrs {
    /** Univer ISlideData snapshot, null for a fresh presentation */
    slideData: Record<string, any> | null
    /** Block height in pixels */
    height: number
}