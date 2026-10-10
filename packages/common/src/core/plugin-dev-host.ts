/**
 * The host's dev-session binding: "this project's builds are the code of that
 * registry entry".
 *
 * ## Why this is a host service and not part of the studio UI
 *
 * The studio used to own the whole loop. Its *page* subscribed to build events
 * and installed each successful build, which meant hot reload only worked while
 * that page happened to be mounted: navigate to the plugin you are developing and
 * the watcher kept rebuilding into nothing. Nothing about "a project is being
 * developed" is a UI concern — it is a property of the registry entry, and it has
 * to survive the page that created it.
 *
 * So the binding lives here, created once by the host application (the same way
 * `pluginMarketplace` is), subscribed to the desktop bridge for the whole app
 * lifetime:
 *
 * ```
 * dev session (main process) ──desktop:event:dev──▶ createPluginDevHost
 *                                                     │ dedupe by build, install
 *                                                     ▼
 *                                            PluginManager.installBundle
 *                                                     │
 *                                                     ▼
 *                                     outcome kept per project, listeners notified
 * ```
 *
 * The studio page and the agent tools now *drive* this service (start/stop
 * watching, build once) and *read* its outcomes; neither of them installs
 * anything.
 */

import type { DevBridge, DevSessionStatus } from './desktop-bridge'
import type { PluginBundle, PluginInstallOutcome } from './plugin-bundle'
import type { PluginManager } from './PluginManager'
import { logger } from '../utils/logger'

/** A project being developed against the running window. */
export interface DevHostProject {
    /** Absolute project root: the identity of a dev session. */
    root: string
    /** Registry key its builds activate under (`knPluginStudio.pluginKey`). */
    pluginKey: string
    /** Runtime name its builds declare. */
    name: string
}

/** A project's binding plus what its last build did. */
export interface DevHostBinding extends DevHostProject {
    /** Build count of the last build this binding processed. */
    buildCount: number
    /**
     * Identities of the builds already installed for this binding
     * (`buildCount@updatedAt`).
     *
     * Not a `>` comparison on the count: a session that restarts behind the
     * binding's back begins counting from 1 again, and that build is a *new* build.
     * The timestamp is what makes the identity exact, and it is also what collapses
     * the two ways one build arrives — the awaited `dev.build` and the broadcast
     * build event share the session's status object — into a single install.
     */
    processed: Set<string>
    /** Outcome of that build's install, when it was processed. */
    outcome?: PluginInstallOutcome
    /** `false` once the plugin's own build was refused (kept for the UI). */
    lastRejected: boolean
    /** Identity of the build `outcome` belongs to. */
    buildId?: string
}

/**
 * The dev-session surface the host publishes to the studio (and to any other
 * tooling that drives plugin development).
 */
export interface PluginDevHostService {
    /**
     * Bind a running session: its incoming builds are installed into the window
     * from now on, whatever page is open. Installs the current build immediately
     * when the session already has one.
     */
    watch(project: DevHostProject): Promise<DevHostBinding>
    /** Stop binding a project. The session itself is untouched. */
    unwatch(root: string): void
    /**
     * Build once and install the result (`dev.build` + install), for an explicit
     * "hot reload now" that does not change the watch state.
     *
     * Returns both halves because a caller usually needs both: the session status
     * (build count, size, modules — what the studio page and the agent report) and
     * the install outcome (whether the window actually changed).
     */
    build(options: {
        root: string
        writeToDisk?: boolean
        externals?: string[]
    }): Promise<{ status?: DevSessionStatus; outcome?: PluginInstallOutcome }>
    /** Current bindings, most recently watched first. */
    list(): DevHostBinding[]
    /** Subscribe to binding/outcome changes (the studio page renders from this). */
    subscribe(listener: () => void): () => void
}

/** How long `build()` waits for the session to report the new build. */
const FRESH_BUILD_TIMEOUT_MS = 15_000
const FRESH_BUILD_POLL_MS = 60

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export interface PluginDevHostOptions {
    /** The registry every bound build activates into. */
    manager: PluginManager
    /** The desktop dev surface, when the host is a desktop build. */
    dev?: DevBridge
}

/**
 * Create the host's dev-session binding service.
 *
 * Registers itself with the desktop bridge immediately: a session that was
 * already watching (this renderer reloaded, the session did not) is re-bound and
 * re-installed, so a dev build is not lost to a page refresh.
 */
export const createPluginDevHost = (options: PluginDevHostOptions): PluginDevHostService => {
    const { manager, dev } = options
    /** project root → binding, insertion-ordered (most recent last). */
    const bindings = new Map<string, DevHostBinding>()
    const listeners = new Set<() => void>()

    const notify = () => {
        for (const listener of [...listeners]) {
            try {
                listener()
            } catch (error) {
                logger.error('[devHost] listener failed', error)
            }
        }
    }

    /**
     * Per-project install chains.
     *
     * A build reaches this service twice when it is asked for explicitly: the
     * caller awaits `dev.build`, and the session also broadcasts the same build
     * event. Installing concurrently would double-install it (both callers can
     * pass the "is this new?" check before either records the count), so every
     * install for one project is serialized, and the check happens inside the
     * chain where it is atomic with the record.
     */
    const chains = new Map<string, Promise<unknown>>()
    const enqueue = <T>(root: string, task: () => Promise<T>): Promise<T> => {
        const run = (chains.get(root) ?? Promise.resolve()).then(task, task)
        chains.set(root, run.catch(() => undefined))
        return run
    }

    /**
     * Install one build status for its project.
     *
     * Idempotent per build: whichever of the two arrivals gets here first installs
     * it, the other is a no-op.
     */
    const installStatus = (status: DevSessionStatus): Promise<PluginInstallOutcome | undefined> =>
        enqueue(status.root, async () => {
        const binding = bindings.get(status.root)
        if (!binding) return undefined
        // A session that survives a failed rebuild keeps its previous build, so
        // there is nothing new to install and nothing to undo.
        if (status.error || !status.build?.code) return undefined
        const buildId = `${status.buildCount}@${status.updatedAt}`
        if (binding.processed.has(buildId)) {
            // Already handled — by the other arrival of this same build. Report what
            // that install did, so a caller that asked for this build still gets an
            // outcome instead of a bare `undefined`.
            return binding.buildId === buildId ? binding.outcome : undefined
        }
        binding.processed.add(buildId)
        binding.buildId = buildId

        const bundle: PluginBundle = {
            code: status.build.code,
            css: status.build.css,
            // The binding's key/name win: they come from the project manifest,
            // which is what the registry entry is filed under. A build reports the
            // same values, but the manifest is the authority when they differ.
            pluginKey: binding.pluginKey || status.plugin.pluginKey,
            name: binding.name || status.plugin.name,
            version: `dev.${status.buildCount}`,
            sourceLabel: status.root,
        }
        binding.buildCount = status.buildCount
        const outcome = await manager.installBundle(bundle)
        binding.outcome = outcome
        binding.lastRejected = outcome.ok === false
        if (outcome.ok === false) {
            logger.warn(`[devHost] ${status.root}: build #${status.buildCount} refused — ${outcome.reason}`)
        }
        notify()
        return outcome
    })

    if (dev) {
        // One subscription for the whole app lifetime, for every project: this is
        // what makes hot reload independent of any page being open.
        dev.onBuild((status) => {
            void installStatus(status).catch(error => {
                logger.error('[devHost] install failed', error)
            })
        })
        // Re-bind sessions that are still watching (a renderer reload keeps the
        // main-process session alive; the window must get its dev build back).
        void dev.status({}).then(
            (sessions) => {
                for (const status of sessions ?? []) {
                    if (!status?.watching) continue
                    bindings.set(status.root, {
                        root: status.root,
                        pluginKey: status.plugin.pluginKey,
                        name: status.plugin.name,
                        buildCount: 0,
                        processed: new Set(),
                        lastRejected: false,
                    })
                    void installStatus(status).catch(() => undefined)
                }
                if (bindings.size > 0) {
                    logger.info(`[devHost] re-bound ${bindings.size} running dev session(s)`)
                    notify()
                }
            },
            () => undefined,
        )
    }

    return {
        async watch(project) {
            const binding: DevHostBinding = {
                ...project,
                buildCount: 0,
                processed: new Set(),
                lastRejected: false,
            }
            bindings.set(project.root, binding)
            notify()

            if (dev) {
                const [status] = await dev.status({ root: project.root })
                if (status) await installStatus(status)
            }
            return bindings.get(project.root) ?? binding
        },

        unwatch(root) {
            if (bindings.delete(root)) notify()
        },

        async build({ root, writeToDisk, externals }) {
            if (!dev) return {}
            const [before] = await dev.status({ root })
            const previous = before?.buildCount ?? 0
            const requested = await dev.build({ root, writeToDisk: writeToDisk === true, externals })
            const fresh = requested.buildCount > previous || requested.state === 'failed' || requested.error
                ? requested
                : await waitForFreshBuild(dev, root, previous)
            return { status: fresh, outcome: fresh ? await installStatus(fresh) : undefined }
        },

        list() {
            return [...bindings.values()].reverse()
        },

        subscribe(listener) {
            listeners.add(listener)
            return () => { listeners.delete(listener) }
        },
    }
}

/**
 * Wait for a session to report a build newer than `previous`.
 *
 * The build event and the promise the caller awaits can race (the session may
 * still be reporting the previous build when `dev.build` resolves), so the new
 * count is confirmed by polling the session status rather than trusting the
 * first answer.
 */
const waitForFreshBuild = async (
    dev: DevBridge,
    root: string,
    previous: number,
): Promise<DevSessionStatus | undefined> => {
    const deadline = Date.now() + FRESH_BUILD_TIMEOUT_MS
    let latest: DevSessionStatus | undefined
    while (Date.now() < deadline) {
        const [status] = await dev.status({ root })
        latest = status ?? latest
        if (!status) return latest
        if (status.buildCount > previous || status.state === 'failed' || status.error) return status
        await sleep(FRESH_BUILD_POLL_MS)
    }
    logger.warn(`[devHost] ${root}: no fresh build within ${FRESH_BUILD_TIMEOUT_MS}ms`)
    return latest
}
