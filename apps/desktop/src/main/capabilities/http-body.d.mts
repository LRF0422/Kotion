/** Types for `http-body.mjs`. Keep in step with the implementation. */

export function detectCharset(contentType: string): string
export function decodeBody(body: Buffer, charset: string): string
export function looksLikeUtf8Text(body: Buffer): boolean
export function chooseBodyRepresentation(
    responseType: unknown,
    contentType: string,
    body: Buffer,
): 'text' | 'base64'
