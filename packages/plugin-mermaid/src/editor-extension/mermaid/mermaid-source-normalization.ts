import mermaid from 'mermaid'

export const LEGACY_XSS_ARROW_ENTITIES_REASON = 'legacy-xss-arrow-entities-v1' as const

export interface MermaidSourceNormalizationResult {
    source: string
    changed: boolean
    reason?: typeof LEGACY_XSS_ARROW_ENTITIES_REASON
}

const LEGACY_OPERATOR_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
    ['--&gt;&gt;', '-->>'],
    ['-&gt;&gt;', '->>'],
    ['--&gt;', '-->'],
    ['&lt;|--', '<|--'],
]

const parseMermaid = async (source: string): Promise<boolean> => {
    try {
        return (await mermaid.parse(source, { suppressErrors: true })) !== false
    } catch {
        return false
    }
}

const recoverKnownOperatorEntities = (source: string): string => {
    let candidate = source
    for (const [encoded, raw] of LEGACY_OPERATOR_REPLACEMENTS) {
        candidate = candidate.split(encoded).join(raw)
    }
    return candidate
}

const hasEncodedClassRelationship = (source: string): boolean =>
    /(?:^|\n)\s*[^\s"']+\s+&lt;\|--\s+[^\s"']+/m.test(source)

/**
 * Recover one known layer of Mermaid operator escaping produced by the legacy
 * request XSS filter. This is deliberately not a general HTML entity decoder.
 */
export const normalizePersistedMermaidSource = async (
    source: string | null | undefined,
): Promise<MermaidSourceNormalizationResult> => {
    const original = typeof source === 'string' ? source : ''
    const candidate = recoverKnownOperatorEntities(original)
    if (candidate === original) return { source: original, changed: false }

    if (hasEncodedClassRelationship(original)) {
        return {
            source: candidate,
            changed: true,
            reason: LEGACY_XSS_ARROW_ENTITIES_REASON,
        }
    }

    if (await parseMermaid(original)) return { source: original, changed: false }
    if (!(await parseMermaid(candidate))) return { source: original, changed: false }

    return {
        source: candidate,
        changed: true,
        reason: LEGACY_XSS_ARROW_ENTITIES_REASON,
    }
}
