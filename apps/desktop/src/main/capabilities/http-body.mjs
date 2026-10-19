/**
 * Deciding whether an `http.request` response body is text or bytes.
 *
 * The old contract had only `bodyText`, which cannot carry a PNG or a PDF: the
 * bytes are not UTF-8, so every plugin that needed an attachment or an inline
 * image had to route through a service that returned base64 JSON. These helpers
 * close that hole — and they are the only part of the HTTP handler that is worth
 * testing on its own, so they live in their own dependency-free module (no
 * `electron`, no `fetch`, no app state).
 */

/** Content types that are textual even without a `charset` parameter. */
const TEXTUAL_CONTENT_TYPE =
    /^(?:text\/|application\/(?:json|xml|x-www-form-urlencoded|javascript|ecmascript|graphql|ld\+json|problem\+json|soap\+xml|xml-dtd|xhtml\+xml|rss\+xml|atom\+xml)|[a-z-]+\/[a-z0-9.+-]*\+json|[a-z-]+\/[a-z0-9.+-]*\+xml)/

/**
 * Extract the charset from a `content-type` header, lowercased and unquoted.
 * Returns `utf-8` when the header names none — the universal default, and the
 * only sane assumption for JSON.
 *
 * @param {string} contentType
 * @returns {string}
 */
export function detectCharset(contentType) {
    const match = /charset\s*=\s*"?([\w.:-]+)"?/i.exec(contentType || '')
    const charset = match?.[1]?.toLowerCase().trim()
    return charset || 'utf-8'
}

/** Charset labels whose canonical name Node's TextDecoder does not accept. */
const CHARSET_ALIASES = {
    gb2312: 'gbk',
    gb_2312: 'gbk',
    'gb-2312': 'gbk',
    'x-gbk': 'gbk',
    utf8: 'utf-8',
    'utf-16': 'utf-16le',
    unicode: 'utf-16le',
    latin1: 'windows-1252',
    'iso8859-1': 'windows-1252',
    'big-5': 'big5',
    shift_jis: 'shift-jis',
    sjis: 'shift-jis',
    'ks_c_5601-1987': 'euc-kr',
}

/**
 * Decode bytes with the named charset, falling back to UTF-8 + replacement
 * characters when the label is not one this runtime knows.
 *
 * @param {Buffer} body
 * @param {string} charset
 * @returns {string}
 */
export function decodeBody(body, charset) {
    const label = CHARSET_ALIASES[charset] ?? charset
    try {
        return new TextDecoder(label, { fatal: false }).decode(body)
    } catch {
        return body.toString('utf8')
    }
}

/**
 * Would these bytes decode as UTF-8 without losing information and without
 * embedded NUL/control noise? Used only when the content type cannot decide
 * (`application/octet-stream`, or no header at all) — the case where "it is a
 * JPEG" and "it is a log file" look identical from the headers alone.
 *
 * @param {Buffer} body
 * @returns {boolean}
 */
export function looksLikeUtf8Text(body) {
    if (!body.length) return true
    let text
    try {
        // `fatal: true` is the whole trick: an invalid sequence throws instead
        // of turning into U+FFFD, which is what distinguishes bytes from text.
        text = new TextDecoder('utf-8', { fatal: true }).decode(body)
    } catch {
        return false
    }
    for (const char of text) {
        const code = char.codePointAt(0)
        // NUL and the C0 controls (except tab / CR / LF) are not text.
        if (code === 0) return false
        if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) return false
    }
    return true
}

/**
 * Decide how one response body should travel.
 *
 * `auto` trusts a textual content type and otherwise sniffs; an explicit
 * `text`/`base64` from the caller always wins, so a plugin that knows better
 * (a CSV served as `application/octet-stream`, a PNG served as `text/plain` by
 * a broken gateway) can say so.
 *
 * @param {unknown} responseType `'auto' | 'text' | 'base64'` (anything else = auto)
 * @param {string} contentType
 * @param {Buffer} body
 * @returns {'text' | 'base64'}
 */
export function chooseBodyRepresentation(responseType, contentType, body) {
    if (responseType === 'text') return 'text'
    if (responseType === 'base64') return 'base64'
    const type = (contentType || '').toLowerCase()
    if (TEXTUAL_CONTENT_TYPE.test(type)) return 'text'
    return looksLikeUtf8Text(body) ? 'text' : 'base64'
}
