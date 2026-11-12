/** Screen capture primitives (sources, region selection). */
export type DesktopCaptureSourceType = 'screen' | 'window'

export interface DesktopCaptureRect {
    x: number
    y: number
    width: number
    height: number
}

/** What the full-screen region overlay renders. */
export interface DesktopRegionContext {
    /** PNG data URL of the display at full resolution. */
    url: string
    width: number
    height: number
    locale: 'zh' | 'en'
}

/** The cropped region returned by the overlay. */
export interface DesktopRegionResult {
    imageDataUrl: string
    width: number
    height: number
}

export interface DesktopCaptureSource {
    /** Pass as chromeMediaSourceId to getUserMedia. */
    id: string
    name: string
    /** PNG data URL of the source thumbnail; empty when unavailable. */
    thumbnail: string
    displayId: string
}
