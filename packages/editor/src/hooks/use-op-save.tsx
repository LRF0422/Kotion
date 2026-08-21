import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import type { BlockOp, OpBatch, OpTrackerStorage, ReconcileSnapshot } from '../extensions/op-tracker'
import { OP_TRACKER_ABSORB } from '../extensions/op-tracker'
import { decideExitFlush } from './exit-flush'
import { toRev } from './rev'

export type { BlockOp, OpBatch, ReconcileSnapshot } from '../extensions/op-tracker'

/** Payload of `POST /page/{id}/ops`. */
export interface ApplyOpsRequest {
  baseRev: number | null
  idempotencyKey: string
  clientId: string
  ops: BlockOp[]
}

/** Payload of `POST /page/{id}/reconcile`. */
export interface ReconcileRequest {
  baseRev: number | null
  clientId: string
  doc: JSONContent
}

/** Per-op verdict as the server reports it; mirrors `OpResultVO`. */
export interface OpVerdict {
  op?: string
  blockId?: string
  /** `applied` | `stale` | `rejected`. */
  status?: string
  /** Machine-readable cause for `stale` / `rejected`. */
  reason?: string
}

/** What both endpoints answer with; mirrors `ApplyOpsVO`. */
export interface ApplyOpsResult {
  /** A rev as it arrives: this backend spells 64-bit integers as JSON strings. */
  rev?: number | string | null
  opsApplied?: number
  replayed?: boolean
  /**
   * Per-op verdicts. A `stale` or `rejected` entry means that part of the
   * batch did NOT land even though the request succeeded — the writer must not
   * treat its baseline as confirmed in that case.
   */
  results?: OpVerdict[]
}

/** What `GET /page/{id}/doc` answers with; mirrors `PageDocVO`. */
export interface PageDocResult {
  doc?: JSONContent | null
  rev?: number | null
}

export interface UseOpSaveOptions {
  editor: Editor | null
  /**
   * Whether this client writes the database. True for the session host only.
   * Turning it on re-baselines the tracker and arms a reconcile; turning it off
   * stops the tracker accumulating anything at all.
   */
  enabled: boolean
  /** Identity this client holds its write lease under. */
  clientId: string
  debounceMs?: number
  onApplyOps: (request: ApplyOpsRequest) => Promise<ApplyOpsResult>
  onReconcile: (request: ReconcileRequest) => Promise<ApplyOpsResult>
  /**
   * Keepalive transport for `pagehide`, where a normal async request is killed
   * by the browser. Only ops are flushed this way: a reconcile carries the whole
   * document and would blow past the ~64KB keepalive body cap.
   *
   * Returning the request lets the closing sequence release the write lease only
   * once the write has landed; see {@link closeSession}.
   */
  onFlush?: (request: ApplyOpsRequest) => void | Promise<unknown>
  /**
   * Batches larger than this are split. Default 500.
   */
  batchThreshold?: number
  /** Ops per request when splitting. Default 400. */
  batchSize?: number
  /**
   * The rev the server last told us the page is at, from the session heartbeat.
   * Ahead of the rev we know about, it means somebody else wrote the page and
   * this client must catch up before writing again.
   */
  serverRev?: number | null
  /**
   * Read the page's current document. Supplied to enable catching up: without
   * it, a write by AI, an import or a scheduled job suspends this client's
   * writing permanently, because nothing can then clear the watermark.
   */
  onFetchDoc?: () => Promise<PageDocResult>
  /**
   * Send every write as a reconcile, never as an op batch.
   *
   * Set when the collaboration server never synced. Ops are *relative* — "insert
   * after X", "move Y before Z" — which only means anything if this client's view
   * of the document matches the server's. A client that never synced has no such
   * guarantee: it is holding whatever it managed to seed, so its anchors may
   * point at blocks the server has since moved, or never had at all, and an op
   * that cannot find its anchor is how a page grows a second copy of a block.
   *
   * Reconcile is *absolute* instead: the server diffs the whole document against
   * its own truth and derives the ops itself, so a stale view costs a larger
   * request rather than a corrupted page.
   */
  reconcileOnly?: boolean
}

export interface OpSaveProgress {
  done: number
  total: number
}

export interface UseOpSaveReturn {
  saving: boolean
  dirty: boolean
  error: Error | null
  /** Non-null only while a split (large) write is in flight. */
  progress: OpSaveProgress | null
  /** The rev this client believes the page is at. */
  rev: number | null
  /**
   * True when the server is at a higher rev than this client. Writing is
   * suspended until the document catches up, because pushing a stale document
   * would revert whatever the other writer did.
   */
  behindServer: boolean
  /** A catch-up fetch is in flight. */
  catchingUp: boolean
  saveNow: () => Promise<void>
  /**
   * Send whatever is still owed, right now, synchronously enough to survive the
   * editor going away. Returns the write in flight, or null when nothing was
   * owed.
   *
   * Exists so the session can flush *before* handing its lease back: the server
   * refuses a write that arrives after the release, and the refused write is the
   * user's last edit.
   */
  flushNow: () => Promise<unknown> | null
}

/** Backoff schedule for automatic retries after a failed write. */
const RETRY_DELAYS_MS = [2000, 5000, 15000]

function getTracker(editor: Editor | null): OpTrackerStorage | null {
  if (!editor) return null
  const storage = (editor.storage as any)?.opTracker as OpTrackerStorage | undefined
  if (!storage || !storage.initialized) return null
  return storage
}

let keyCounter = 0

/**
 * An idempotency key that is stable for one attempt at one piece of work and
 * never reused. Retries deliberately resend the *same* key: if the original
 * request landed and only its response was lost, the server replays the stored
 * outcome instead of applying the ops twice — which for an `insert` would mean a
 * duplicate block, the exact failure this architecture exists to stop.
 */
function newKey(clientId: string): string {
  keyCounter += 1
  return `${clientId}:${Date.now().toString(36)}:${keyCounter}`
}

/** Split an array into fixed-size chunks. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Work that has been handed to the network but not yet acknowledged in full.
 *
 * It is kept verbatim across retries rather than re-derived. Re-deriving would
 * mint a new idempotency key each time, and a batch whose response was lost
 * would then be applied twice.
 */
type PendingWrite =
  | {
      kind: 'ops'
      batch: OpBatch
      requests: ApplyOpsRequest[]
      /** Index of the next request to send; everything before it succeeded. */
      cursor: number
    }
  | {
      kind: 'reconcile'
      snapshot: ReconcileSnapshot
      request: ReconcileRequest
    }

/**
 * Persists a page by submitting ops, for the one client that holds its write
 * lease.
 *
 * Two things differ from the incremental-save hook this replaces, and both are
 * load-bearing:
 *
 * **Requests are sequential, never concurrent.** The old hook fired upsert
 * batches through three parallel workers, which was safe because each change
 * carried its own absolute position. An op does not: an `insert` positioned
 * `after: X` is meaningless until X exists. Ops are emitted in document order
 * with deletes last precisely so that sending them in order makes every anchor
 * resolvable — parallelism would throw that guarantee away for a saving that
 * only matters on an import.
 *
 * **Anything uncertain reconciles.** A partially-applied split batch leaves the
 * server in a state this client cannot name, so instead of trying to work out
 * what survived, the next write sends the whole document and lets the server
 * diff. Reconcile is idempotent and emits nothing on an aligned document, so
 * using it as the sink for every uncertain case costs nothing.
 */
export function useOpSave(options: UseOpSaveOptions): UseOpSaveReturn {
  const {
    editor, enabled, clientId, debounceMs = 3000,
    onApplyOps, onReconcile, onFlush,
    batchThreshold = 500, batchSize = 400, serverRev = null, onFetchDoc,
    reconcileOnly = false,
  } = options

  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [progress, setProgress] = useState<OpSaveProgress | null>(null)
  const [rev, setRev] = useState<number | null>(null)
  const [behindServer, setBehindServer] = useState(false)
  const [catchingUp, setCatchingUp] = useState(false)

  const savingRef = useRef(false)
  // A trigger arrived while a write was in flight — run one more round after it
  // so those edits are not stranded until the next keystroke.
  const queuedRef = useRef(false)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<PendingWrite | null>(null)
  const revRef = useRef<number | null>(null)
  const serverRevRef = useRef<number | null>(serverRev)
  const doSaveRef = useRef<() => Promise<void>>()
  const catchingUpRef = useRef(false)
  const catchUpRef = useRef<() => Promise<void>>()
  const catchUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Whether the exit flush has already gone out for the work currently on the
  // tracker. Two things ask for it — the closing session, and this hook's own
  // cleanup — and deriving a batch twice would mint a second idempotency key for
  // ops that are already on the wire, which for an `insert` means a duplicate
  // block: the one failure this architecture exists to prevent. Cleared by the
  // next real change, which is new work and owed again.
  const flushedRef = useRef(false)

  const onApplyOpsRef = useRef(onApplyOps)
  onApplyOpsRef.current = onApplyOps
  const onReconcileRef = useRef(onReconcile)
  onReconcileRef.current = onReconcile
  const onFlushRef = useRef(onFlush)
  onFlushRef.current = onFlush
  const onFetchDocRef = useRef(onFetchDoc)
  onFetchDocRef.current = onFetchDoc
  // Read at write time rather than captured, so flipping it takes effect on the
  // very next write instead of whenever `doSave` happens to be rebuilt.
  const reconcileOnlyRef = useRef(reconcileOnly)
  reconcileOnlyRef.current = reconcileOnly

  // Seed the rev from the session's first answer: that is the rev the document
  // in front of the user was loaded at. Later revs come from our own writes.
  useEffect(() => {
    serverRevRef.current = serverRev
    if (serverRev != null && revRef.current == null) {
      revRef.current = serverRev
      setRev(serverRev)
    }
    setBehindServer(
      serverRev != null && revRef.current != null && serverRev > revRef.current,
    )
  }, [serverRev])

  const noteRev = useCallback((next: number | string | null | undefined) => {
    if (next == null) return
    const parsed = toRev(next)
    if (parsed == null) {
      // Something answered with a rev we cannot read. Keep the old one rather
      // than guessing, and say so: a rev quietly dropped is how this client ends
      // up writing against a baseRev of null and never noticing.
      console.warn('[useOpSave] unreadable rev in response, keeping', revRef.current, 'got', next)
      return
    }
    revRef.current = parsed
    setRev(parsed)
    const ahead = serverRevRef.current
    setBehindServer(ahead != null && ahead > parsed)
  }, [])

  /**
   * Fold the server's document into the local one, so this client can write again.
   *
   * Reached only when the heartbeat watermark says the page moved on without us:
   * AI, an import or a scheduled job wrote it through `PageOpService`, which holds
   * no lease and does not need one. Writing is already suspended at this point,
   * and without this it would stay suspended for the rest of the session — nothing
   * else can ever bring our rev up to the server's.
   *
   * Every failure path here leaves writing suspended rather than reaching for
   * reconcile. That is the opposite of this hook's usual instinct, and it is the
   * point: reconcile declares the local document authoritative, which would
   * revert the very write we came to collect. Suspended loses nothing — the page
   * stops autosaving until a reload reads it cleanly.
   */
  const catchUp = useCallback(async (): Promise<void> => {
    if (!enabled || catchingUpRef.current) return
    const fetchDoc = onFetchDocRef.current
    if (!fetchDoc) return
    const tracker = getTracker(editor)
    if (!tracker) return

    if (savingRef.current || pendingRef.current) {
      // Wait, do not race. A write in flight is about to advance our rev itself,
      // and a batch already handed to the network carries an `order` snapshot
      // that `commitBatch` will install as the baseline — overwriting the
      // baseline this catch-up installs, and with it the fact that the server's
      // blocks are already saved. The next save would then insert them again.
      if (catchUpTimerRef.current == null) {
        catchUpTimerRef.current = setTimeout(() => {
          catchUpTimerRef.current = null
          void catchUpRef.current?.()
        }, 1000)
      }
      return
    }

    catchingUpRef.current = true
    setCatchingUp(true)
    try {
      const result = await fetchDoc()
      if (!editor || editor.isDestroyed) return

      const doc = result?.doc
      if (!doc) {
        // Refused, and specifically *not* treated as an empty document: doing so
        // would delete every clean block on the page because a response came
        // back malformed. A genuinely empty page still arrives as `{type: 'doc'}`.
        console.warn('[useOpSave] catch-up returned no document; not merging')
        return
      }

      const fetchedRev = result?.rev ?? null
      if (fetchedRev == null) {
        console.warn('[useOpSave] catch-up returned no rev; not merging')
        return
      }
      if (revRef.current != null && fetchedRev < revRef.current) {
        // A read that landed behind our own writes — a replica lagging, or a
        // response overtaken by one of our saves. Applying it would revert us.
        console.warn(
          `[useOpSave] catch-up read rev ${fetchedRev}, behind this client at ${revRef.current}; ignoring`,
        )
        return
      }

      const summary = tracker.absorbServerDoc(doc)
      if (!summary) return

      // Only now does the local document contain the server's write, so only now
      // may our rev claim to be at it.
      noteRev(fetchedRev)
      console.info(
        `[useOpSave] caught up to rev ${fetchedRev}: +${summary.inserted} -${summary.removed} ~${summary.replaced} moved ${summary.moved}, ${summary.localOnly} local block(s) still unsaved`,
      )
    } catch (err) {
      console.warn('[useOpSave] catch-up failed:', err)
    } finally {
      catchingUpRef.current = false
      setCatchingUp(false)
    }
  }, [editor, enabled, noteRev])
  catchUpRef.current = catchUp

  const doSave = useCallback(async () => {
    if (!enabled) return
    if (savingRef.current) {
      queuedRef.current = true
      return
    }
    const tracker = getTracker(editor)
    if (!tracker) return

    if (serverRevRef.current != null && revRef.current != null
      && serverRevRef.current > revRef.current) {
      // Somebody wrote the page behind our back — AI, an import, a scheduled
      // job. Pushing our document now would revert it. Stop writing and wait to
      // catch up; the watermark clears itself once our rev has caught up.
      console.warn(
        `[useOpSave] server is at rev ${serverRevRef.current}, this client at ${revRef.current}; write suspended`,
      )
      setBehindServer(true)
      return
    }

    // Resume unfinished work before looking for new work, so a lost response is
    // retried under its original idempotency key.
    let pending = pendingRef.current
    if (!pending) {
      if (tracker.needsReconcile || reconcileOnlyRef.current) {
        if (!tracker.dirty) {
          // Asked of `dirty` and deliberately not of `hasDirty()`. The two differ
          // by `needsReconcile`, which every session arms on purpose — the
          // baseline came off the screen rather than out of the database — so
          // reading it as work to do made an untouched page write itself back,
          // whole document and all. It answers *how* to write, not *whether* to.
          setDirty(false)
          return
        }
        const snapshot = tracker.getReconcile()
        pending = {
          kind: 'reconcile',
          snapshot,
          request: { baseRev: revRef.current, clientId, doc: snapshot.doc },
        }
      } else {
        const batch = tracker.getBatch()
        if (!batch) {
          // `getBatch` may itself have decided a reconcile is needed (duplicate
          // top-level ids); leave `dirty` alone in that case so the next tick
          // picks the reconcile up.
          if (!tracker.needsReconcile) setDirty(false)
          return
        }
        const groups = batch.ops.length > batchThreshold
          ? chunk(batch.ops, batchSize)
          : [batch.ops]
        pending = {
          kind: 'ops',
          batch,
          requests: groups.map(ops => ({
            baseRev: revRef.current,
            idempotencyKey: newKey(clientId),
            clientId,
            ops,
          })),
          cursor: 0,
        }
      }
      pendingRef.current = pending
    }

    savingRef.current = true
    setSaving(true)
    setError(null)

    let failed = false
    try {
      if (pending.kind === 'reconcile') {
        const result = await onReconcileRef.current(pending.request)
        noteRev(result?.rev)
        if (editor && !editor.isDestroyed) tracker.commitReconcile(pending.snapshot)
      } else {
        const total = pending.requests.length
        if (total > 1) setProgress({ done: pending.cursor, total })
        while (pending.cursor < total) {
          const result = await onApplyOpsRef.current(pending.requests[pending.cursor])
          noteRev(result?.rev)
          pending.cursor += 1
          if (total > 1) setProgress({ done: pending.cursor, total })
        }
        if (editor && !editor.isDestroyed) tracker.commitBatch(pending.batch)
      }
      pendingRef.current = null
      retryCountRef.current = 0
      setDirty(tracker.hasDirty())
    } catch (err) {
      failed = true
      const e = err instanceof Error ? err : new Error(String(err))
      if ((err as any)?.staleOps) {
        // The server marked part of this batch stale: the baseline the batch was
        // derived from no longer describes the database. Resending it — which is
        // what the retry path below would do, same idempotency key and all —
        // would hit the same wall. Drop it and let the next attempt reconcile
        // the whole document instead.
        console.warn('[useOpSave] stale ops detected; dropping pending batch and reconciling')
        pendingRef.current = null
        retryCountRef.current = 0
        tracker.requireReconcile()
      }
      setError(e)
      console.error('[useOpSave] write failed:', e)
    } finally {
      setProgress(null)
      savingRef.current = false
      setSaving(false)
      if (failed) {
        if (retryCountRef.current < RETRY_DELAYS_MS.length) {
          if (retryTimerRef.current == null) {
            const delay = RETRY_DELAYS_MS[retryCountRef.current++]
            retryTimerRef.current = setTimeout(() => {
              retryTimerRef.current = null
              void doSaveRef.current?.()
            }, delay)
          }
        } else {
          // Out of retries. A half-applied split batch has left the server
          // somewhere this client cannot describe, so stop guessing: drop the
          // pending work and let the next write send the whole document.
          const partial = pendingRef.current
          if (partial?.kind === 'ops' && partial.cursor > 0) {
            console.warn(
              `[useOpSave] ${partial.cursor}/${partial.requests.length} op requests applied before failing; reconciling`,
            )
          }
          pendingRef.current = null
          retryCountRef.current = 0
          tracker.requireReconcile()
          setDirty(true)
        }
      } else if (queuedRef.current) {
        queuedRef.current = false
        if (tracker.hasDirty()) void doSaveRef.current?.()
      }
    }
  }, [editor, enabled, clientId, batchThreshold, batchSize, noteRev])
  doSaveRef.current = doSave

  // Catch up whenever the watermark says the page moved on without us.
  //
  // Only the host runs this. A collaborator holds no lease, writes nothing, and
  // receives the host's merge through Yjs like any other edit — having every
  // client pull and merge the same document independently would have them all
  // apply it to the same shared Y.Doc.
  //
  // `serverRev` is in the dependencies as well as `behindServer` so that a
  // catch-up which bailed (a write was in flight, a response came back
  // malformed) is retried on the next heartbeat rather than waiting for the flag
  // to change, which it would not.
  useEffect(() => {
    if (!enabled || !behindServer) return
    void catchUpRef.current?.()
  }, [enabled, behindServer, serverRev])

  useEffect(() => () => {
    if (catchUpTimerRef.current != null) {
      clearTimeout(catchUpTimerRef.current)
      catchUpTimerRef.current = null
    }
  }, [])

  // Gate the tracker itself on the session role. A collaborator leaves this
  // false and therefore accumulates nothing — "a collaborator writes zero bytes
  // to the database" is structural rather than a rule to remember.
  useEffect(() => {
    const tracker = getTracker(editor)
    if (!tracker) return
    tracker.enabled = enabled
    if (!enabled) {
      pendingRef.current = null
      return
    }
    // Becoming host: re-baseline against what is actually on screen (content
    // loaded before this point — Yjs sync, setContent, progressive load — is
    // already saved), then arm a reconcile so the first write forces agreement
    // with the database rather than trusting a baseline nobody confirmed.
    tracker.resetBaseline()
    tracker.requireReconcile()
    // Nothing is owed yet, and saying otherwise put "Editing" on a page the user
    // had only opened.
    flushedRef.current = false
    setDirty(false)
  }, [editor, enabled])

  // Immediate "Editing" feedback, before the idle debounce fires. Unlike the old
  // hook this does not skip remote transactions: the host persists collaborators'
  // edits too, so their work makes this client dirty.
  useEffect(() => {
    if (!editor || !enabled) return
    const handler = ({ transaction }: { transaction: any }) => {
      if (!transaction.docChanged) return
      // A catch-up folding in a server-side write. Those blocks are in the
      // database already, so showing "Editing" here would promise a save that
      // has nothing to do.
      if (transaction.getMeta(OP_TRACKER_ABSORB)) return
      // New work: an exit flush that already went out no longer covers it.
      flushedRef.current = false
      setDirty(true)
    }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor, enabled])

  // Idle stream from the tracker's ProseMirror view plugin, which fires on every
  // PM state update rather than through Tiptap's event emitter (unreliable in
  // this codebase's collab setup).
  useEffect(() => {
    if (!editor || !enabled) return
    const tracker = getTracker(editor)
    if (!tracker) return

    const unsubscribe = tracker.subscribeIdle(() => { void doSave() }, debounceMs)
    return () => {
      unsubscribe()
      if (retryTimerRef.current != null) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [editor, enabled, debounceMs, doSave])

  /**
   * Send whatever is still owed, on the way out.
   *
   * Returns the writes in flight so the caller can order the lease release after
   * them, or null when nothing was owed. Nothing here decides *whether* work is
   * owed — that is {@link decideExitFlush}, where it can be read and checked
   * without an editor.
   */
  const flushExit = useCallback((): Promise<unknown> | null => {
    if (!editor || !enabled) return null
    const tracker = getTracker(editor)
    if (!tracker) return null
    if (flushedRef.current) return null

    const send = (request: ApplyOpsRequest): Promise<unknown> => {
      const flush = onFlushRef.current
      // Failures are swallowed rather than reported: the editor is going away, so
      // there is nobody left to tell and nothing left to retry with.
      if (flush) return Promise.resolve(flush(request)).catch(() => {})
      return onApplyOpsRef.current(request).catch(() => {})
    }

    const reconcile = (): Promise<unknown> => {
      // Too big for a keepalive body, so this is a genuine best effort: the
      // request usually survives long enough on a same-origin connection.
      const snapshot = tracker.getReconcile()
      return onReconcileRef.current({
        baseRev: revRef.current, clientId, doc: snapshot.doc,
      }).catch(() => {})
    }

    const stashed = pendingRef.current
    const decision = decideExitFlush({
      pending: stashed != null,
      dirty: tracker.dirty,
      needsReconcile: tracker.needsReconcile,
      reconcileOnly: reconcileOnlyRef.current,
    })

    let inFlight: Promise<unknown> | null = null
    if (decision === 'pending' && stashed) {
      // Re-sent verbatim, keys included: if the original landed and only its
      // response was lost, the server replays the stored outcome.
      inFlight = stashed.kind === 'reconcile'
        ? onReconcileRef.current(stashed.request).catch(() => {})
        : Promise.all(stashed.requests.slice(stashed.cursor).map(send))
    } else if (decision === 'reconcile') {
      inFlight = reconcile()
    } else if (decision === 'ops') {
      const batch = tracker.getBatch()
      if (batch) {
        inFlight = send({
          baseRev: revRef.current,
          idempotencyKey: newKey(clientId),
          clientId,
          ops: batch.ops,
        })
      } else if (tracker.needsReconcile) {
        // `getBatch` found duplicate top-level ids and demanded a reconcile
        // instead; reconciling is what converges the page.
        inFlight = reconcile()
      }
    }

    if (inFlight) flushedRef.current = true
    return inFlight
  }, [editor, enabled, clientId])

  // Best-effort flush when the page or the component goes away: without it,
  // anything typed inside the debounce window dies with the tab.
  //
  // The session's closing sequence asks for the same flush before it releases the
  // lease, and gets there first in both paths. This one stays because the writer
  // can also be switched off on its own — demotion, a page that stops loading —
  // when no lease is being handed back at all.
  useEffect(() => {
    if (!editor || !enabled) return

    const onPageHide = () => { void flushExit() }
    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      // Unmount / page switch: the regular async path is fine, the request's
      // promise outlives the component. No commit — the tracker dies with the
      // editor, and the idempotency key makes a duplicate submission harmless.
      void flushExit()
    }
  }, [editor, enabled, flushExit])

  const saveNow = useCallback(async () => {
    const tracker = getTracker(editor)
    tracker?.cancelIdle()
    await doSave()
  }, [editor, doSave])

  return { saving, dirty, error, progress, rev, behindServer, catchingUp, saveNow, flushNow: flushExit }
}
