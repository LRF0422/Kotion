/**
 * Types for manager.mjs (plain JS so the dev-server child and the tests can
 * import it directly). Shapes mirror the `dev.*` contract in
 * `@kn/common`'s desktop-bridge, declared structurally here for the same
 * reason the other plugin-dev modules do it.
 */

export interface DevBuild {
    code: string
    outFile?: string
    bytes: number
    durationMs: number
    modules: string[]
}

export interface DevSessionStatus {
    root: string
    state: 'idle' | 'starting' | 'watching' | 'failed' | 'stopped'
    plugin: { pluginKey: string | null; name: string; icon?: string }
    build?: DevBuild
    error?: string
    buildCount: number
    updatedAt: number
    watching: boolean
}

export interface DevLogEntry {
    level: 'info' | 'warn' | 'error'
    message: string
    at: number
}

export interface DevProjectEntry {
    root: string
    name: string
    pluginKey?: string
    displayName?: string
    entry?: string
    updatedAt?: number
    active?: boolean
}

export interface DevScaffoldResult {
    root: string
    pluginKey: string
    template: string
    files: string[]
    managed: boolean
}

export interface DevRemoveResult {
    root: string
    removed: boolean
    pluginKey?: string | null
    name?: string | null
}

export interface DevDeleteFileResult {
    root: string
    path: string
    relativePath: string
    removed: boolean
    bytes: number
    /** The deleted text, when it was small enough to echo back for undo. */
    content?: string
    truncated: boolean
}

export interface DevSessionOptions {
    root: string
    watch?: boolean
    writeToDisk?: boolean
    externals?: string[]
}

export class DevSessionManager {
    constructor()
    /** Subscribe to session events ('build' | 'build-error'); returns an unsubscribe. */
    onEvent(listener: (event: string, status: DevSessionStatus) => void): () => void
    start(options: DevSessionOptions): Promise<DevSessionStatus>
    stop(options: { root: string }): Promise<boolean>
    /**
     * One-shot rebuild. A session is started when the project has none; a
     * *changed* `externals` list restarts the session, because the child
     * process's externals are fixed at spawn time.
     */
    build(options: DevSessionOptions): Promise<DevSessionStatus>
    status(options?: { root?: string }): DevSessionStatus[]
    logs(options: { root: string; limit?: number }): DevLogEntry[]
    scaffold(options: {
        name: string
        displayName?: string
        pluginKey?: string
        template?: string
        parentDir?: string
        projectsDir?: string
        overwrite?: boolean
    }): Promise<DevScaffoldResult>
    /** Stop the session and delete the project; refuses anything that is not a plugin project. */
    removeProject(options: { root: string }): Promise<DevRemoveResult>
    /**
     * Delete one file inside a project. Confined to the project root; refuses
     * the manifest and the entry file.
     */
    deleteProjectFile(options: { root: string; path: string }): Promise<DevDeleteFileResult>
    listProjects(options?: { dir?: string }): Promise<DevProjectEntry[]>
    dispose(): void
}
