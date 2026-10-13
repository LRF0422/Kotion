/**
 * Desktop network policy — the `http.request` SSRF guard's decision layer.
 *
 * The main process proxies arbitrary HTTP for plugins (so no CORS preflight),
 * which makes it the app's only SSRF surface: loopback, private, link-local and
 * cloud-metadata targets are refused by default. A LAN gateway is a legitimate
 * target for a *user-configured* connector though — PostgREST on `192.168.x`,
 * a local dev service, a home-lab box — so the refusal is a policy the user can
 * lift, not a hard wall bolted into the request path.
 *
 * Design notes:
 * - Pure functions, no electron / fs / dns imports, so `net-policy.check.ts`
 *   can exercise every branch with plain Node.
 * - `decideTarget` answers allow / deny / "resolve this hostname first"; the
 *   caller does the lookup and re-judges every answer with
 *   `decideResolvedAddress`, so a name cannot resolve into a blocked address
 *   behind the policy's back (DNS rebinding, round-robin with a private A).
 * - Cloud metadata endpoints stay blocked even with the switch on: they are
 *   credential-theft targets, never "the LAN gateway I configured". This is the
 *   one invariant the switch does not move.
 */

import { isIP } from 'node:net'

export interface DesktopNetPolicy {
    /**
     * Allow `http.request` to reach loopback / RFC1918 / link-local / ULA
     * targets. Off by default: a compromised plugin must not be able to walk
     * the LAN unless the user asked for it.
     */
    allowPrivateNetwork: boolean
}

/** Fail closed: anything unreadable or malformed means "deny private targets". */
export const DEFAULT_NET_POLICY: DesktopNetPolicy = { allowPrivateNetwork: false }

/** The shape the guard needs for one address. */
export type AddressVerdict = 'public' | 'private' | 'metadata'

/** Outcome of judging a raw request URL against the policy. */
export type TargetDecision =
    /** Safe to fetch as-is (literal public address, or private with the switch on). */
    | { action: 'allow'; url: URL }
    /** A hostname: resolve it, then judge every answer with {@link decideResolvedAddress}. */
    | { action: 'resolve'; url: URL; host: string }
    /** Refused; `reason` is the exact message the IPC call rejects with. */
    | { action: 'deny'; reason: string }

/**
 * IPv4 ranges the guard refuses unless the user lifted it. Kept in step with
 * the pre-policy guard so the default behaviour is unchanged.
 */
const BLOCKED_V4 = [
    /^0\./,
    /^10\./,
    /^127\./,
    /^169\.254\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
]

/**
 * Cloud instance-metadata endpoints. Always refused, switch or not:
 * `169.254.169.254` is AWS/GCP/Azure, `100.100.100.200` is Aliyun, and
 * `fd00:ec2::254` is the IPv6 AWS form.
 */
const METADATA_V4 = new Set(['169.254.169.254', '100.100.100.200'])
const METADATA_V6 = new Set(['fd00:ec2::254'])

/** IPv4 text, with each octet in range (rejects `999.1.1.1`). */
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

/** Read a stored/forwarded policy without letting a malformed value widen access. */
export function normalizeNetPolicy(raw: unknown): DesktopNetPolicy {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_NET_POLICY }
    return { allowPrivateNetwork: (raw as { allowPrivateNetwork?: unknown }).allowPrivateNetwork === true }
}

/**
 * Decode an IPv4 address carried inside an IPv6 literal's last 32 bits.
 * Covers the three forms that make an IPv6 literal reach an IPv4 destination:
 * IPv4-mapped (`::ffff:192.168.1.1`), the NAT64 well-known prefix
 * (`64:ff9b::7f00:1`) and the deprecated IPv4-compatible form (`::127.0.0.1`).
 * Node serializes these as hex groups, so the parsing has to be numeric —
 * matching `::ffff:` text alone would let `::ffff:c0a8:101` (192.168.1.1)
 * through as "public".
 */
const trailingIpv4 = (groups: string[]): string | undefined => {
    if (groups.length < 2) return undefined
    const hi = groups[groups.length - 2]
    const lo = groups[groups.length - 1]
    if (!/^[0-9a-f]{1,4}$/.test(hi) || !/^[0-9a-f]{1,4}$/.test(lo)) return undefined
    const high = Number.parseInt(hi, 16)
    const low = Number.parseInt(lo, 16)
    return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join('.')
}

/** Classify one textual address (IPv4, or IPv6 including IPv4-bearing forms). */
export function classifyAddress(address: string): AddressVerdict {
    const value = address.trim().toLowerCase().replace(/^\[|\]$/g, '')
    if (METADATA_V4.has(value)) return 'metadata'
    if (IPV4.test(value)) return BLOCKED_V4.some((re) => re.test(value)) ? 'private' : 'public'

    if (METADATA_V6.has(value)) return 'metadata'
    if (value.startsWith('::ffff:') || value.startsWith('64:ff9b::') || value.startsWith('::')) {
        // Canonical mapped form keeps its dotted tail: `::ffff:192.168.1.1`.
        const tail = value.slice(value.lastIndexOf(':') + 1)
        if (IPV4.test(tail)) return classifyAddress(tail)
        // Node's URL parser may also serialize the tail as hex groups.
        const embedded = trailingIpv4(value.split(':'))
        if (embedded) return classifyAddress(embedded)
    }
    if (value === '::1' || value === '::') return 'private'
    // Link-local (fe80::/10) and unique-local (fc00::/7) IPv6.
    if (value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return 'private'
    return 'public'
}

/**
 * Judge a raw request URL before any DNS traffic happens.
 *
 * Only `http`/`https` are allowed, and a literal address is decided here; a
 * hostname is handed back as `resolve` so the caller can pin it. A zone-scoped
 * IPv6 literal (`fe80::1%en0`) is not an `isIP` literal, so it is treated as a
 * name and fails resolution rather than slipping through as public.
 */
export function decideTarget(raw: string, policy: DesktopNetPolicy): TargetDecision {
    let url: URL
    try {
        url = new URL(raw)
    } catch {
        return { action: 'deny', reason: 'desktop http: invalid URL' }
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { action: 'deny', reason: 'desktop http: only http/https is allowed' }
    }
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (!host) return { action: 'deny', reason: 'desktop http: invalid URL' }

    if (host === 'localhost' || host.endsWith('.localhost')) {
        if (policy.allowPrivateNetwork) return { action: 'allow', url }
        return { action: 'deny', reason: 'desktop http: localhost is blocked' }
    }
    if (isIP(host) !== 0) {
        const verdict = classifyAddress(host)
        if (verdict === 'metadata') {
            return { action: 'deny', reason: 'desktop http: cloud metadata address is blocked' }
        }
        if (verdict === 'private' && !policy.allowPrivateNetwork) {
            return { action: 'deny', reason: 'desktop http: private address is blocked' }
        }
        return { action: 'allow', url }
    }
    return { action: 'resolve', url, host }
}

/**
 * Judge one address the resolver returned for a hostname.
 *
 * The message differs from the literal case on purpose — "resolves to a
 * private address" tells the user the URL they typed only *looked* public.
 */
export function decideResolvedAddress(
    address: string,
    policy: DesktopNetPolicy,
): { action: 'allow' } | { action: 'deny'; reason: string } {
    const verdict = classifyAddress(address)
    if (verdict === 'metadata') {
        return { action: 'deny', reason: 'desktop http: cloud metadata address is blocked' }
    }
    if (verdict === 'private' && !policy.allowPrivateNetwork) {
        return { action: 'deny', reason: 'desktop http: resolves to a private address' }
    }
    return { action: 'allow' }
}
