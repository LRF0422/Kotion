/** Types for workspace-candidates.mjs (plain JS so tests can import it directly). */

export function workspaceRootCandidates(options?: {
    /** `app.getAppPath()`: checkout root in dev, `<Resources>/app.asar` when packaged. */
    appPath?: string
    /** `process.resourcesPath` — where `afterPack` ships `kn-studio-runtime`. */
    resourcesPath?: string
    /** `__dirname` of the caller, for the bundled-dev walk-up candidate. */
    moduleDir?: string
    cwd?: string
    env?: Record<string, string | undefined>
}): string[]
