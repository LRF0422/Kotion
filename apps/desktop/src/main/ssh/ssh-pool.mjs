/**
 * SSH capability — pooled connections (main process).
 *
 * A handshake (TCP + key exchange + auth) is the expensive part of every SSH
 * call, and a file browser or a tight command loop makes many tiny calls:
 * list, stat, read, exec. This module keeps **one live connection per
 * `user@host:port` + host-key policy**, hands it out as a lease, and closes it
 * once it has been idle for {@link DEFAULT_SSH_POOL_IDLE_MS} (60 s). One lazily
 * opened SFTP channel rides on each connection too, for the same reason: the
 * `sftp` subsystem handshake is paid once, not once per directory listing.
 *
 * What this module deliberately does **not** do:
 *
 * - **No protocol, no trust decision.** `connect` is injected and is the same
 *   gated path as before (network policy + host-key verification + auth);
 *   pooling only decides *when* to reuse a client that was already accepted.
 * - **No retries of operations.** A connection the server closed while idle
 *   surfaces as one failed call; by then its `close` event has dropped it, so
 *   the next call reconnects. Silently retrying an `exec` could run a
 *   side-effecting command twice, which is worse than a visible failure.
 * - **No shell reuse.** An interactive shell owns its client for its lifetime
 *   (`index.ts` bypasses the pool for `shellOpen`): it is a long-lived stream,
 *   not a request/response call, and two plugins must never share a pty.
 *
 * Invalidation and races:
 *
 * - `invalidate(target)` is how the wiring tells the pool that a trust decision
 *   changed (a rotated/removed credential, a revoked host grant). It closes
 *   matching entries **and bumps a per-key epoch**, so a handshake that is
 *   already in flight cannot land in the pool afterwards: it is closed and its
 *   callers retry on a fresh connection (re-resolving credentials). Callers that
 *   arrive after the invalidation never join a pre-invalidation handshake.
 * - A burst of concurrent first calls shares one handshake. Each waiter reserves
 *   a slot while the handshake is in flight, so the LRU cap can never evict a
 *   connection that is about to be leased (the cap stays a *soft* limit: it may
 *   be exceeded briefly while the connections are in use).
 *
 * Pure Node apart from `ssh-params.mjs` (the key format), so `ssh.test.mjs`
 * drives it with fake clients and with a real in-process `ssh2.Server`.
 */
import { sshGrantKey } from './ssh-params.mjs'

/** How long an unused connection (and its SFTP channel) is kept alive. */
export const DEFAULT_SSH_POOL_IDLE_MS = 60_000

/**
 * Soft cap on distinct live connections. Entries beyond it are evicted
 * least-recently-used first, but only while they are neither leased nor
 * reserved by a waiter: a burst of concurrent calls may exceed the cap briefly
 * rather than cut one another off.
 */
export const DEFAULT_SSH_POOL_MAX_ENTRIES = 8

/**
 * Pool identity: `user@host:port` plus the host-key policy.
 *
 * The policy is part of the key on purpose. A connection accepted under
 * `strict` was authenticated against a key already in `known_hosts`; reusing it
 * for a caller that asked for `accept-new` would silently hand out the weaker
 * guarantee (and the reverse would be a surprising refusal).
 */
export const sshPoolKey = (target, hostKeyPolicy = 'strict') =>
    `${sshGrantKey({ user: target.user ?? null, host: target.host, port: Number(target.port ?? 22) })}|${hostKeyPolicy}`

/** Close something without letting a "already gone" throw mask the real path. */
const endQuietly = (end, client) => {
    try {
        end(client)
    } catch {
        /* already gone */
    }
}

const endSessionQuietly = (session) => {
    try {
        session?.end?.()
    } catch {
        /* already closed */
    }
}

/** Error code used to tell "the pool changed under us" from a real connect failure. */
const SSH_POOL_STALE = 'SSH_POOL_STALE'

const staleError = (key) => {
    const error = new Error(`desktop ssh: the connection for "${key}" was invalidated while connecting`)
    error.code = SSH_POOL_STALE
    return error
}

const disposedError = () => new Error('desktop ssh: the connection pool was disposed')

/**
 * Create a pool.
 *
 * Dependencies are injected so the pool stays protocol-agnostic and testable:
 *
 * @param {{
 *   openSftp?: ((client: unknown) => Promise<unknown>) | null,
 *   end?: (client: unknown) => void,
 *   idleMs?: number,
 *   maxEntries?: number,
 *   now?: () => number,
 *   setTimer?: (run: () => void, ms: number) => unknown,
 *   clearTimer?: (handle: unknown) => void,
 * }} [options]
 */
export const createSshPool = ({
    openSftp = null,
    end = (client) => client?.end?.(),
    idleMs = DEFAULT_SSH_POOL_IDLE_MS,
    maxEntries = DEFAULT_SSH_POOL_MAX_ENTRIES,
    now = () => Date.now(),
    setTimer = (run, ms) => setTimeout(run, ms),
    clearTimer = (handle) => clearTimeout(handle),
} = {}) => {
    if (typeof end !== 'function') throw new Error('desktop ssh: pool needs an end() function')
    if (!Number.isFinite(idleMs) || idleMs < 0) {
        throw new Error('desktop ssh: pool idleMs must be a non-negative number')
    }
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
        throw new Error('desktop ssh: pool maxEntries must be a positive integer')
    }

    /** key → connected entry. Only entries whose client is believed alive live here. */
    const entries = new Map()
    /**
     * key → in-flight first connection, so a burst shares one handshake.
     * Shape: `{ epoch, target, hostKeyPolicy, waiters, entry, promise }`.
     */
    const pending = new Map()
    /** key → generation; bumped by invalidate/dispose to orphan in-flight work. */
    const epochs = new Map()
    let disposed = false

    /**
     * Generations are **monotonic for the lifetime of the key** and are never
     * pruned. A handshake can outlive its map entry (a post-invalidation attempt
     * overwrites `pending[key]` while an older handshake is still connecting), so
     * deleting the counter once "nothing looks in flight" would let that older
     * handshake pass its epoch check and land a pre-revocation session. One
     * integer per invalidated key for the app run is the cheap, safe side.
     */
    const currentEpoch = (key) => epochs.get(key) ?? 0
    const bumpEpoch = (key) => {
        const next = currentEpoch(key) + 1
        epochs.set(key, next)
        return next
    }

    /** Forget bookkeeping (timer, SFTP channel, map slot) without touching the client. */
    const forget = (entry) => {
        if (entry.idleTimer !== null) {
            clearTimer(entry.idleTimer)
            entry.idleTimer = null
        }
        entry.sftp = null
        entry.sftpPending = null
        if (entries.get(entry.key) === entry) entries.delete(entry.key)
    }

    const closeEntry = (entry) => {
        if (entry.closed) return
        entry.closed = true
        forget(entry)
        endQuietly(end, entry.client)
    }

    /**
     * Start the idle countdown for a connection with no outstanding lease.
     * The timer is `unref`ed (when the runtime supports it) so a pending idle
     * timer never keeps the app alive after the last window closes.
     */
    const scheduleIdle = (entry) => {
        if (entry.closed || entry.idleTimer !== null) return
        if (idleMs <= 0) {
            closeEntry(entry)
            return
        }
        entry.idleTimer = setTimer(() => {
            entry.idleTimer = null
            if (entry.closed) return
            // Defensive: a lease outliving its release would be a bug, and
            // closing the client under a running call is the worst outcome.
            if (entry.leases > 0) {
                scheduleIdle(entry)
                return
            }
            closeEntry(entry)
        }, idleMs)
        entry.idleTimer?.unref?.()
    }

    /**
     * Keep the map bounded, never evicting the entry being added, one in use, or
     * one a waiter has reserved while its handshake is still landing.
     */
    const evictLru = (keep) => {
        while (entries.size > maxEntries) {
            let oldest = null
            for (const entry of entries.values()) {
                if (entry === keep || entry.leases > 0 || entry.reserved > 0) continue
                if (!oldest || entry.lastUsed < oldest.lastUsed) oldest = entry
            }
            if (!oldest) return
            closeEntry(oldest)
        }
    }

    /** Drop the entry as soon as the server (or transport) closes the client. */
    const watchClient = (entry) => {
        const lost = () => {
            if (entry.closed) return
            entry.closed = true
            forget(entry)
        }
        // 'close' is the normal end; 'end' is the half-close some servers emit.
        entry.client?.on?.('close', lost)
        entry.client?.on?.('end', lost)
        entry.client?.on?.('error', () => {
            lost()
            // An error after `ready` means the client is unusable; end it so the
            // socket is not left half-open (end() is idempotent).
            endQuietly(end, entry.client)
        })
    }

    /**
     * Start (or join) the handshake for `key`. The caller owns the epoch it
     * decided to connect under; if `invalidate()` bumped it meanwhile, the
     * client that lands is closed instead of pooled and the callers retry.
     */
    const startConnect = (key, target, hostKeyPolicy, connect, epoch = currentEpoch(key)) => {
        const normalized = {
            host: target.host,
            user: target.user ?? null,
            port: Number(target.port ?? 22),
        }
        const inflight = { epoch, target: normalized, hostKeyPolicy, waiters: 1, entry: null, promise: null }
        /**
         * Publish the pending entry *before* invoking `connect()`: the promise is
         * a deferred, so a burst (or a re-entrant invalidation) always sees a
         * thenable entry, and joining waiters can reserve against it.
         */
        let resolveInflight
        let rejectInflight
        inflight.promise = new Promise((resolve, reject) => {
            resolveInflight = resolve
            rejectInflight = reject
        })
        pending.set(key, inflight)
        ;(async () => {
            try {
                if (disposed) throw disposedError()
                const session = await connect()
                const client = session?.client ?? session
                if (disposed) {
                    endQuietly(end, client)
                    throw disposedError()
                }
                if (currentEpoch(key) !== epoch) {
                    // A credential rotation or `forget` happened while the handshake
                    // was in flight: this session must never be handed out. The
                    // generation is monotonic, so an older orphaned handshake that
                    // lands after a newer attempt failed is still rejected here.
                    endQuietly(end, client)
                    throw staleError(key)
                }
                if (!client) throw new Error('desktop ssh: connect() produced no client')
                const entry = {
                    key,
                    target: normalized,
                    hostKeyPolicy,
                    client,
                    leases: 0,
                    /** Slots reserved by waiters of the shared handshake (see evictLru). */
                    reserved: inflight.waiters,
                    lastUsed: now(),
                    idleTimer: null,
                    sftp: null,
                    sftpPending: null,
                    closed: false,
                }
                watchClient(entry)
                entries.set(key, entry)
                inflight.entry = entry
                evictLru(entry)
                resolveInflight(entry)
            } catch (error) {
                rejectInflight(error)
            }
        })()
        const settle = () => {
            if (pending.get(key) === inflight) pending.delete(key)
        }
        inflight.promise.then(settle, settle)
        // Waiters attach their own handlers; this one only keeps a shared failure
        // from being reported as unhandled while they wake up.
        inflight.promise.catch(() => {})
        return inflight.promise
    }

    /** Open (once) and cache the SFTP channel that rides on a pooled client. */
    const openChannel = (entry) => {
        const promise = Promise.resolve()
            .then(() => {
                if (!openSftp) throw new Error('desktop ssh: this pool has no SFTP opener')
                return openSftp(entry.client)
            })
            .then((session) => {
                if (entry.closed) {
                    endSessionQuietly(session)
                    throw new Error('desktop ssh: the connection closed while its SFTP channel was opening')
                }
                entry.sftp = session
                // The open is done, so the in-flight marker must not survive it:
                // otherwise a channel later closed by the server would be handed
                // back out of a resolved `sftpPending` (and never reopen).
                entry.sftpPending = null
                const drop = () => {
                    if (entry.sftp === session) {
                        entry.sftp = null
                        entry.sftpPending = null
                    }
                }
                // A server may close the subsystem while the connection stays up;
                // the next call then reopens the channel on the same client.
                session?.on?.('close', drop)
                session?.on?.('error', drop)
                return session
            })
            .catch((error) => {
                entry.sftpPending = null
                // A *timeout* means the connection itself is suspect (or dead).
                // An explicit refusal (no SFTP subsystem) means the server
                // answered, so keep the client pooled for exec calls and let the
                // next SFTP call retry the channel.
                if (!entry.closed && error?.code === 'SSH_SFTP_TIMEOUT') closeEntry(entry)
                throw error
            })
        entry.sftpPending = promise
        return promise
    }

    const acquireSftp = (entry) => {
        if (entry.closed) return Promise.reject(new Error('desktop ssh: the pooled connection is closed'))
        if (entry.sftp) return Promise.resolve(entry.sftp)
        if (!entry.sftpPending) return openChannel(entry)
        return entry.sftpPending
    }

    /** Count a lease on an entry whose client is known to be alive. */
    const leaseFromEntry = (entry) => {
        if (entry.idleTimer !== null) {
            clearTimer(entry.idleTimer)
            entry.idleTimer = null
        }
        entry.leases += 1
        entry.lastUsed = now()
        let released = false
        return {
            key: entry.key,
            client: entry.client,
            target: entry.target,
            get closed() {
                return entry.closed
            },
            /** The shared, lazily opened SFTP channel for this connection. */
            sftp: () => acquireSftp(entry),
            /** End the lease; the connection starts its idle countdown here. */
            release: () => {
                if (released) return
                released = true
                entry.leases = Math.max(0, entry.leases - 1)
                entry.lastUsed = now()
                if (!entry.closed && entry.leases === 0) scheduleIdle(entry)
            },
            /** Drop the connection (and its channel); later calls reconnect. */
            invalidate: () => closeEntry(entry),
        }
    }

    /**
     * Lease the connection for `target` + `hostKeyPolicy`, connecting once for a
     * concurrent burst. `connect` is called at most once per new connection and
     * is where the caller resolves credentials and verifies the host key.
     *
     * @param {{
     *   target: { host: string, user?: string | null, port?: number },
     *   hostKeyPolicy?: 'strict' | 'accept-new',
     *   connect: () => Promise<unknown>,
     * }} options
     */
    const acquire = async ({ target, hostKeyPolicy = 'strict', connect } = {}) => {
        if (disposed) throw disposedError()
        if (typeof connect !== 'function') throw new Error('desktop ssh: acquire() needs a connect() function')
        const key = sshPoolKey(target, hostKeyPolicy)
        const maxAttempts = 3
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            if (disposed) throw disposedError()

            const existing = entries.get(key)
            if (existing && !existing.closed) return leaseFromEntry(existing)

            const epoch = currentEpoch(key)
            const inflight = pending.get(key)
            if (inflight && inflight.epoch === epoch) {
                // Join the shared handshake and reserve a slot: the cap must not
                // evict an entry that waiters are about to lease.
                inflight.waiters += 1
                if (inflight.entry) inflight.entry.reserved += 1
                let entry
                try {
                    entry = await inflight.promise
                } catch (error) {
                    if (error?.code === SSH_POOL_STALE && attempt + 1 < maxAttempts) continue
                    throw error
                }
                if (entry.closed || currentEpoch(key) !== epoch) {
                    // Give the reservation back before retrying; a closed entry is
                    // already forgotten from the map, but keep the accounting exact.
                    entry.reserved = Math.max(0, entry.reserved - 1)
                    if (attempt + 1 < maxAttempts) continue
                    throw staleError(key)
                }
                entry.reserved = Math.max(0, entry.reserved - 1)
                return leaseFromEntry(entry)
            }

            let entry
            try {
                entry = await startConnect(key, target, hostKeyPolicy, connect, epoch)
            } catch (error) {
                if (error?.code === SSH_POOL_STALE && attempt + 1 < maxAttempts) continue
                throw error
            }
            if (entry.closed) {
                entry.reserved = Math.max(0, entry.reserved - 1)
                continue
            }
            entry.reserved = Math.max(0, entry.reserved - 1)
            return leaseFromEntry(entry)
        }
        throw new Error('desktop ssh: could not obtain a pooled connection')
    }

    /**
     * Drop every connection for a target — all host-key policies unless one is
     * named — and orphan its in-flight handshakes. Used when the user rotates or
     * removes a stored credential or revokes a host: a connection authenticated
     * under the old decision must not be reused, and a handshake that started
     * before the change must not land in the pool afterwards.
     */
    const invalidate = (target, { hostKeyPolicy } = {}) => {
        const matches = (candidate) =>
            candidate.target.host === target.host &&
            (candidate.target.user ?? null) === (target.user ?? null) &&
            Number(candidate.target.port ?? 22) === Number(target.port ?? 22) &&
            (!hostKeyPolicy || candidate.hostKeyPolicy === hostKeyPolicy)

        const keys = new Set()
        for (const [key, entry] of entries) if (matches(entry)) keys.add(key)
        for (const [key, inflight] of pending) if (matches(inflight)) keys.add(key)
        for (const key of keys) {
            bumpEpoch(key)
            const entry = entries.get(key)
            if (entry) closeEntry(entry)
        }
        return keys.size
    }

    /** Close everything. In-flight handshakes end themselves as they resolve. */
    const dispose = () => {
        disposed = true
        for (const entry of [...entries.values()]) closeEntry(entry)
        for (const [key, inflight] of [...pending]) {
            // Orphan anything still connecting: it must not be pooled even if it
            // resolves just before this flag is observed.
            bumpEpoch(key)
            inflight.promise.catch(() => {})
        }
    }

    return {
        acquire,
        invalidate,
        dispose,
        /** Number of live pooled connections (excludes in-flight handshakes). */
        size: () => entries.size,
        /** Keys currently pooled, for diagnostics and tests. */
        keys: () => [...entries.keys()],
    }
}
