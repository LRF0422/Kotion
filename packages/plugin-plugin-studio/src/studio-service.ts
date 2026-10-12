/**
 * Plugin Studio — host-facing glue.
 *
 * Keeps every desktop-host interaction in one place so the React layer stays
 * declarative:
 *  - `useDevCapability()` feature-detects a dev-capable desktop host
 *  - `installBundle()` pushes a freshly built bundle into the running app
 *  - `useProjects()` persists the studio's project list
 *
 * The studio is desktop-only by design: bundling runs in a Node child process
 * behind the `dev.*` capabilities, which the web host does not have.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    logger,
    useOptionalService,
    useStorage,
    type DevBridge,
    type DevSessionStatus,
    type PluginBundle,
    type PluginDevHostService,
    type PluginInstallOutcome,
} from '@kn/common'

/** Legacy `localStorage` key; imported into the storage service at startup. */
const STORAGE_KEY = 'kn.plugin-studio.projects.v1'
/** Where the project list lives durably (`storage.get('projects')`). */
const STORAGE_NAMESPACE = 'plugin.plugin-studio'
const STORAGE_PROJECTS_KEY = 'projects'

export interface StudioProject {
    /** Absolute path of the plugin source project. */
    root: string
    /** Display name shown in the list. */
    label: string
    /** Registry key reported by the project's manifest. */
    pluginKey?: string
    /** Last looked-at; drives list order. */
    lastOpenedAt: number
}

export interface DevCapability {
    /** The desktop bridge's dev surface, when the host has one. */
    dev: DevBridge
    /** True when this is a desktop host at all (so the UI can explain itself). */
    isDesktop: boolean
}

/**
 * Read the desktop dev surface.
 *
 * `undefined` means "no dev-capable desktop host" — either the web build (no
 * `desktop` service at all) or a desktop build predating the studio runtime.
 */
export const useDevCapability = (): DevCapability | undefined => {
    const desktop = useOptionalService('desktop')
    return useMemo(() => {
        if (!desktop) return undefined
        if (!desktop.dev) return undefined
        return { dev: desktop.dev, isDesktop: true }
    }, [desktop])
}

export const useHasDesktop = (): boolean => Boolean(useOptionalService('desktop'))

/**
 * Install a built bundle into the running plugin manager.
 *
 * Uses the `pluginHost`/`pluginManagement` core service rather than importing
 * `PluginManager`, so the studio stays a normal plugin.
 *
 * The host decides what the install *is*: a first activation, a hot reload of the
 * entry with that registry key, or a dev build shadowing a published artifact of
 * the same plugin. The studio no longer guesses — it used to ask whether a plugin
 * "was running" under the manifest's `displayName`, which is a **label**, not an
 * identity: a bundle may translate its own `name` (`name: t('API Client')`), so
 * that question answered "no" for a plugin that was running, turned a reload into
 * a colliding fresh install, and failed silently for a whole project.
 *
 * Returns what the host reports: `mode` says whether the previous instance was
 * replaced (state preserved) and `reason` says why nothing happened.
 */
export const useInstallBundle = () => {
    const pluginManagement = useOptionalService('pluginManagement')
    const pluginHost = useOptionalService('pluginHost')
    return useCallback(
        async (status: DevSessionStatus): Promise<PluginInstallOutcome> => {
            const installer = pluginManagement ?? pluginHost
            if (!installer) {
                throw new Error('pluginManagement/pluginHost service is unavailable in this host')
            }
            const build = status.build
            if (!build?.code) {
                throw new Error('This project has no successful build yet')
            }
            const bundle: PluginBundle = {
                code: build.code,
                // Part of the transaction: the host applies it on commit and puts
                // the previous stylesheet back if it refuses the build.
                css: build.css,
                pluginKey: status.plugin.pluginKey,
                name: status.plugin.name,
                version: `dev.${status.buildCount}`,
                sourceLabel: status.root,
            }

            // Typed path when the host has it (it is the contract now); the older
            // boolean surface is still accepted so the studio keeps working on a
            // host that has not been rebuilt.
            if (installer.installBundle) return installer.installBundle(bundle)

            let reason = ''
            const installed = await installer.installFromSource({
                ...bundle,
                replace: true,
                onRejected: (why) => { reason = why },
            })
            return installed
                ? { ok: true, mode: 'installed', key: bundle.pluginKey, name: bundle.name, version: bundle.version }
                : { ok: false, key: bundle.pluginKey, reason: reason || '宿主没有说明原因' }
        },
        [pluginManagement, pluginHost],
    )
}

/**
 * The outcome as a one-line message for the studio UI.
 *
 * `undefined` (nothing built yet) is not an error; a refusal is, and it carries
 * the host's own words.
 */
export const describeInstallOutcome = (outcome: PluginInstallOutcome | undefined): string | null => {
    if (!outcome || outcome.ok) return null
    return `热更被拒绝：${outcome.reason}（窗口里仍是上一个可用版本）`
}

/**
 * The host's dev-session binding service, when it is registered.
 *
 * This is what installs a project's builds: the binding lives in the host, so a
 * watched project keeps hot-reloading the window while the developer is looking
 * at the plugin instead of at the studio page. `undefined` means an older desktop
 * host, in which case the page falls back to installing build events itself.
 */
export const usePluginDevHost = (): PluginDevHostService | undefined =>
    useOptionalService('pluginDevHost')

/** The plugin-marketplace (catalogue lifecycle) service, when registered. */
export const useMarketplace = () => useOptionalService('pluginMarketplace')

/**
 * Permanently delete a plugin project's files from disk.
 *
 * The studio's project list is only a pointer; this is the destructive half of
 * "delete plugin project". It prefers the dev surface's `removeProject`, which
 * stops the session and refuses anything that is not a plugin project; desktop
 * builds that predate that capability fall back to the allowlisted `fs.remove`.
 * The caller owns dropping the list entry.
 */
export const useDeleteProject = () => {
    const desktop = useOptionalService('desktop')
    return useCallback(
        async (root: string): Promise<void> => {
            if (!desktop) {
                throw new Error('当前宿主不是桌面客户端，无法删除工程文件')
            }
            if (desktop.has('dev.remove') && desktop.dev) {
                await desktop.dev.removeProject({ root })
                return
            }
            const result = await desktop.invoke('fs.remove', { path: root })
            if (result && result.success === false) {
                throw new Error(result.error || `删除工程目录失败：${root}`)
            }
        },
        [desktop],
    )
}

/** Subscribe to build events for one project (or all of them). */
export const useBuildEvents = (
    onBuild: (status: DevSessionStatus) => void,
    root?: string,
): void => {
    const dev = useDevCapability()
    const handler = useCallback(onBuild, [onBuild])
    useEffect(() => {
        if (!dev) return undefined
        return dev.dev.onBuild(handler, root)
    }, [dev, handler, root])
}

/** Coerce whatever is stored into a usable project list. */
const normalizeProjects = (value: unknown): StudioProject[] => {
    if (!Array.isArray(value)) return []
    return value
        .filter((entry) => entry && typeof (entry as StudioProject).root === 'string')
        .map((entry) => {
            const item = entry as StudioProject
            return {
                root: item.root,
                label: item.label || item.root.split(/[\\/]/).pop() || item.root,
                pluginKey: item.pluginKey,
                lastOpenedAt: Number(item.lastOpenedAt) || 0,
            }
        })
        .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
}

/**
 * Seed the first render from the legacy key.
 *
 * The durable read is async, and an empty project list for one frame looks like
 * data loss; the seed costs nothing and the effect below replaces it as soon as
 * the store answers.
 */
const readLegacyProjects = (): StudioProject[] => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        return raw ? normalizeProjects(JSON.parse(raw)) : []
    } catch {
        return []
    }
}

/**
 * The studio's project list.
 *
 * Durable in the storage service (SQLite on desktop), with `localStorage` kept
 * as a compatibility mirror: an older build of the app, or a host whose durable
 * write failed, still sees the list. The mirror goes away once every consumer
 * reads the store.
 */
export const useProjects = () => {
    const storageService = useStorage()
    const storage = useMemo(
        () => storageService?.scope(STORAGE_NAMESPACE),
        [storageService],
    )
    const [projects, setProjects] = useState<StudioProject[]>(() => readLegacyProjects())
    const latest = useRef(projects)
    latest.current = projects

    const write = useCallback(
        (next: StudioProject[]) => {
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
            } catch {
                // Best-effort mirror; the durable write below is the real one.
            }
            void storage?.set(STORAGE_PROJECTS_KEY, next).catch((error) => {
                logger.warn('plugin-studio: could not persist the project list', error)
            })
        },
        [storage],
    )

    useEffect(() => {
        if (!storage) return undefined
        let cancelled = false
        void (async () => {
            try {
                const entry = await storage.get<StudioProject[]>(STORAGE_PROJECTS_KEY)
                if (cancelled) return
                if (entry) {
                    setProjects(normalizeProjects(entry.value))
                    return
                }
                // Nothing stored yet: seed it from whatever the legacy key (or
                // a still-running older build) gave us, so the first run of this
                // version does not lose the list.
                if (latest.current.length) write(latest.current)
            } catch (error) {
                logger.warn('plugin-studio: could not read the project list from storage', error)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [storage, write])

    const persist = useCallback(
        (next: StudioProject[]) => {
            setProjects(next)
            write(next)
        },
        [write],
    )

    const addProject = useCallback(
        (project: Omit<StudioProject, 'lastOpenedAt'> & { lastOpenedAt?: number }) => {
            const entry: StudioProject = {
                ...project,
                label: project.label || project.root.split(/[\\/]/).pop() || project.root,
                lastOpenedAt: project.lastOpenedAt ?? Date.now(),
            }
            setProjects((current) => {
                const next = [entry, ...current.filter((item) => item.root !== entry.root)]
                write(next)
                return next
            })
            return entry
        },
        [write],
    )

    const removeProject = useCallback((root: string) => {
        setProjects((current) => {
            const next = current.filter((item) => item.root !== root)
            write(next)
            return next
        })
    }, [write])

    const touchProject = useCallback((root: string, patch: Partial<StudioProject> = {}) => {
        setProjects((current) => {
            const next = current.map((item) =>
                item.root === root ? { ...item, ...patch, lastOpenedAt: Date.now() } : item,
            )
            write(next)
            return next
        })
    }, [write])

    return { projects, addProject, removeProject, touchProject, persist }
}

/** Human-readable size for build output. */
export const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
