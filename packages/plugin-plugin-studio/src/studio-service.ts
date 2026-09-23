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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOptionalService, type DevBridge, type DevSessionStatus } from '@kn/common'

const STORAGE_KEY = 'kn.plugin-studio.projects.v1'

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
 * Uses the `pluginHost` core service rather than importing `PluginManager`, so
 * the studio stays a normal plugin. `replace: true` makes it a hot reload: any
 * plugin with the same runtime name is uninstalled first.
 */
export const useInstallBundle = () => {
    const pluginManagement = useOptionalService('pluginManagement')
    const pluginHost = useOptionalService('pluginHost')
    return useCallback(
        async (status: DevSessionStatus): Promise<boolean> => {
            // Prefer the full management service; pluginHost is the older,
            // narrower surface kept for hosts that predate it.
            const installer = pluginManagement ?? pluginHost
            if (!installer) {
                throw new Error('pluginManagement/pluginHost service is unavailable in this host')
            }
            const build = status.build
            if (!build?.code) {
                throw new Error('This project has no successful build yet')
            }
            return installer.installFromSource({
                code: build.code,
                pluginKey: status.plugin.pluginKey,
                name: status.plugin.name,
                version: `dev.${status.buildCount}`,
                replace: true,
                sourceLabel: status.root,
            })
        },
        [pluginManagement, pluginHost],
    )
}

/** The plugin-marketplace (catalogue lifecycle) service, when registered. */
export const useMarketplace = () => useOptionalService('pluginMarketplace')

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

const readProjects = (): StudioProject[] => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as StudioProject[]
        if (!Array.isArray(parsed)) return []
        return parsed
            .filter((entry) => entry && typeof entry.root === 'string')
            .map((entry) => ({
                root: entry.root,
                label: entry.label || entry.root.split(/[\\/]/).pop() || entry.root,
                pluginKey: entry.pluginKey,
                lastOpenedAt: Number(entry.lastOpenedAt) || 0,
            }))
            .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
    } catch {
        return []
    }
}

const writeProjects = (projects: StudioProject[]): void => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
    } catch {
        // Storage is best-effort; the studio still works for this session.
    }
}

/** The studio's project list, persisted in localStorage. */
export const useProjects = () => {
    const [projects, setProjects] = useState<StudioProject[]>(() => readProjects())

    const persist = useCallback((next: StudioProject[]) => {
        setProjects(next)
        writeProjects(next)
    }, [])

    const addProject = useCallback(
        (project: Omit<StudioProject, 'lastOpenedAt'> & { lastOpenedAt?: number }) => {
            const entry: StudioProject = {
                ...project,
                label: project.label || project.root.split(/[\\/]/).pop() || project.root,
                lastOpenedAt: project.lastOpenedAt ?? Date.now(),
            }
            setProjects((current) => {
                const next = [entry, ...current.filter((item) => item.root !== entry.root)]
                writeProjects(next)
                return next
            })
            return entry
        },
        [],
    )

    const removeProject = useCallback((root: string) => {
        setProjects((current) => {
            const next = current.filter((item) => item.root !== root)
            writeProjects(next)
            return next
        })
    }, [])

    const touchProject = useCallback((root: string, patch: Partial<StudioProject> = {}) => {
        setProjects((current) => {
            const next = current.map((item) =>
                item.root === root ? { ...item, ...patch, lastOpenedAt: Date.now() } : item,
            )
            writeProjects(next)
            return next
        })
    }, [])

    return { projects, addProject, removeProject, touchProject, persist }
}

/** Human-readable size for build output. */
export const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
