/**
 * Image attachments for the agent.
 *
 * Images are handed to the model as multimodal (vision) content parts — the
 * model's own image understanding does the reading. Nothing here interprets an
 * image locally (no OCR / no captioning): these helpers only load, downscale
 * and encode bytes, shared by the editor `readImage` tool and the chat
 * composer.
 */

import { authorizedFetch } from '../../utils/session'

/** Tool-result key that carries images from a frontend tool to the backend. */
export const AGENT_IMAGES_KEY = '__agentImages'

/** A single image prepared for the agent (base64, no `data:` prefix). */
export interface AgentImageData {
    /** IANA media type, e.g. `image/jpeg` or `image/png`. */
    mimeType: string
    /** Base64 payload without the `data:<mime>;base64,` prefix. */
    data: string
    /** Optional display name / filename. */
    name?: string
    /** Optional alt text from the source node. */
    alt?: string
    width?: number
    height?: number
}

/** Shape returned by a frontend tool that produced images. */
export interface AgentImageToolResult {
    [AGENT_IMAGES_KEY]: AgentImageData[]
    /** Short human-readable summary (kept small — the images travel separately). */
    note?: string
}

/**
 * OpenAI-compatible multimodal content part. Sent to the backend verbatim and
 * forwarded to the provider as the message's `content` array.
 */
export type AgentContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }

/** True when a frontend tool result carries agent images. */
export function isAgentImageToolResult(value: unknown): value is AgentImageToolResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const images = (value as Record<string, unknown>)[AGENT_IMAGES_KEY]
    return Array.isArray(images) && images.every(isAgentImageData)
}

export function isAgentImageData(value: unknown): value is AgentImageData {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const record = value as Record<string, unknown>
    return typeof record.mimeType === 'string' && typeof record.data === 'string'
}

/** `data:<mime>;base64,<data>` URL for an image attachment. */
export function toImageDataUrl(image: AgentImageData): string {
    return `data:${image.mimeType};base64,${image.data}`
}

/** Build the multimodal content parts for one message. */
export function buildImageContentParts(
    text: string | undefined,
    images: AgentImageData[],
): AgentContentPart[] {
    const parts: AgentContentPart[] = []
    if (text && text.trim()) {
        parts.push({ type: 'text', text })
    }
    for (const image of images) {
        if (!isAgentImageData(image)) continue
        parts.push({ type: 'image_url', image_url: { url: toImageDataUrl(image) } })
    }
    return parts
}

/** Split a data URL into its mime type + base64 payload. */
export function dataUrlToAgentImage(dataUrl: string, name?: string): AgentImageData | null {
    const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl)
    if (!match) return null
    const mimeType = match[1] || 'image/png'
    if (!mimeType.startsWith('image/')) return null
    if (!match[2]) {
        // Percent-encoded (non-base64) data URL: encode to base64.
        try {
            const bytes = new TextEncoder().encode(decodeURIComponent(match[3]))
            return { mimeType, data: bytesToBase64(bytes), name }
        } catch {
            return null
        }
    }
    return { mimeType, data: match[3], name }
}

/** Longest edge (px) an attachment is downscaled to before sending. */
export const MAX_IMAGE_DIMENSION = 1400

/** JPEG quality used when re-encoding a downscaled raster image. */
export const IMAGE_JPEG_QUALITY = 0.82

/** Rough bound on the base64 payload kept for one image (~4 MB decoded). */
export const MAX_IMAGE_DATA_CHARS = 6_000_000

/**
 * Read a File/picked image, downscaling it to {@link MAX_IMAGE_DIMENSION} on
 * its longest edge and preferring JPEG for opaque photos. Falls back to the raw
 * bytes when no canvas is available (SSR / tests / uncommon formats).
 */
export async function fileToAgentImage(file: File): Promise<AgentImageData> {
    const name = file.name || undefined
    const raw = await readFileAsDataUrl(file)
    if (!raw) throw new Error('无法读取图片文件')
    const direct = dataUrlToAgentImage(raw, name)
    if (!direct) throw new Error('不支持的图片格式: ' + (file.type || 'unknown'))
    if (typeof document === 'undefined' || file.type === 'image/gif' || file.type === 'image/svg+xml') {
        return direct
    }
    try {
        const downscaled = await downscaleDataUrl(raw, file.type)
        return downscaled ? { ...downscaled, name } : direct
    } catch {
        return direct
    }
}

/** Load an image URL (page asset, blob:, data:) into an attachment. */
export async function urlToAgentImage(src: string, alt?: string, name?: string): Promise<AgentImageData> {
    if (src.startsWith('data:')) {
        const fromData = dataUrlToAgentImage(src, name)
        if (!fromData) throw new Error('不支持的图片数据')
        return { ...fromData, alt }
    }
    // Plain fetch matches how the editor loads the image (same cookies / public
    // URL). A cross-origin asset without CORS headers throws here, and an
    // authenticated same-origin/gateway asset answers 401/403 — both fall back
    // to the platform's Bearer-aware wrapper.
    let response: Response
    try {
        response = await fetch(src, { credentials: 'include' })
    } catch {
        response = await authorizedFetch(src)
    }
    if (!response.ok && (response.status === 401 || response.status === 403 || response.status === 0)) {
        response = await authorizedFetch(src)
    }
    if (!response.ok) {
        throw new Error('图片下载失败 (' + response.status + ')')
    }
    const blob = await response.blob()
    const mimeType = blob.type || guessMimeType(src)
    if (!mimeType.startsWith('image/')) {
        throw new Error('目标不是图片: ' + (mimeType || 'unknown'))
    }
    const raw = await blobToDataUrl(blob)
    const direct = dataUrlToAgentImage(raw, name)
    if (!direct) throw new Error('图片编码失败')
    if (typeof document === 'undefined' || mimeType === 'image/gif' || mimeType === 'image/svg+xml') {
        return { ...direct, mimeType, alt }
    }
    try {
        const downscaled = await downscaleDataUrl(raw, mimeType)
        return downscaled ? { ...downscaled, name, alt } : { ...direct, alt }
    } catch {
        return { ...direct, alt }
    }
}

function guessMimeType(src: string): string {
    const path = src.split(/[?#]/)[0].toLowerCase()
    if (path.endsWith('.png')) return 'image/png'
    if (path.endsWith('.webp')) return 'image/webp'
    if (path.endsWith('.gif')) return 'image/gif'
    if (path.endsWith('.svg')) return 'image/svg+xml'
    return 'image/jpeg'
}

function readFileAsDataUrl(file: File): Promise<string | null> {
    return new Promise(resolve => {
        if (typeof FileReader === 'undefined') {
            resolve(null)
            return
        }
        const reader = new FileReader()
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(file)
    })
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error ?? new Error('blob read failed'))
        reader.readAsDataURL(blob)
    })
}

/** Draw a data URL onto a canvas with capped dimensions. Null when impossible. */
async function downscaleDataUrl(dataUrl: string, mimeType: string): Promise<AgentImageData | null> {
    const image = await loadImage(dataUrl)
    if (!image) return null
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) return null
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, targetWidth, targetHeight)
    const opaque = mimeType !== 'image/png' && mimeType !== 'image/webp'
    const outputType = opaque ? 'image/jpeg' : mimeType
    const encoded = canvas.toDataURL(outputType, IMAGE_JPEG_QUALITY)
    const parsed = dataUrlToAgentImage(encoded)
    if (!parsed) return null
    return { ...parsed, width: targetWidth, height: targetHeight }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
        if (typeof Image === 'undefined') {
            resolve(null)
            return
        }
        const image = new Image()
        image.crossOrigin = 'anonymous'
        image.onload = () => resolve(image)
        image.onerror = () => resolve(null)
        image.src = src
    })
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i])
    }
    if (typeof btoa === 'function') {
        return btoa(binary)
    }
    // Node/SSR fallback.
    const maybeBuffer = (globalThis as any)?.Buffer
    return maybeBuffer ? maybeBuffer.from(bytes).toString('base64') : ''
}
