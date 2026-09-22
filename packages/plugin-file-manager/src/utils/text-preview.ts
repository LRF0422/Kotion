/**
 * Helpers for rendering plain-text style files (txt / sql / code / config …)
 * as an inline preview. Kept free of React so they can be unit-checked directly.
 */

/** Upper bound on how many bytes are fetched and rendered for a text preview. */
export const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

const REPLACEMENT_CHAR = '\uFFFD';

const decodeWith = (bytes: Uint8Array, encoding: string): string | null => {
    try {
        return new TextDecoder(encoding, { fatal: false }).decode(bytes);
    } catch {
        // Encoding unsupported in this runtime.
        return null;
    }
};

const countReplacementChars = (text: string): number => {
    const matches = text.match(/\uFFFD/g);
    return matches ? matches.length : 0;
};

/**
 * Decode raw text bytes. UTF-8 is the default; when the UTF-8 pass produces
 * replacement characters we also try GB18030, which covers the legacy
 * GBK/GB2312 encodings still common in Chinese text and SQL dumps.
 */
export const decodeTextBytes = (bytes: Uint8Array): string => {
    const utf8 = decodeWith(bytes, 'utf-8') ?? '';
    if (!utf8.includes(REPLACEMENT_CHAR)) return utf8;

    const legacy = decodeWith(bytes, 'gb18030');
    if (legacy && countReplacementChars(legacy) < countReplacementChars(utf8)) {
        return legacy;
    }
    return utf8;
};

/**
 * Heuristic for files that are classified as text by extension but actually
 * contain binary data: a NUL byte in the leading bytes is a strong signal.
 */
export const looksBinary = (bytes: Uint8Array): boolean => {
    const limit = Math.min(bytes.length, 8192);
    for (let index = 0; index < limit; index += 1) {
        if (bytes[index] === 0) return true;
    }
    return false;
};

/** Read at most MAX_TEXT_PREVIEW_BYTES from a blob and report whether it was cut. */
export const readPreviewBytes = async (blob: Blob): Promise<{ bytes: Uint8Array; truncated: boolean }> => {
    const truncated = blob.size > MAX_TEXT_PREVIEW_BYTES;
    const slice = truncated ? blob.slice(0, MAX_TEXT_PREVIEW_BYTES) : blob;
    const buffer = await slice.arrayBuffer();
    return { bytes: new Uint8Array(buffer), truncated };
};
