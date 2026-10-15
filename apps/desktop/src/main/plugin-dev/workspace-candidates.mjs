/**
 * Where the host package sources can be found (main process).
 *
 * `dev.hostApi` — the agent's `searchHostApi` / `readHostApiFile` tools — reads
 * the standard packages' TypeScript source as the authoritative interface
 * reference. In a checkout that is `<repo>/packages/*`; in a packaged app
 * `afterPack` ships the same sources to
 * `<Resources>/kn-studio-runtime/host-api/packages/*`.
 *
 * This list used to live inside `index.ts` with a candidate for
 * `app.asar.unpacked/out/main/plugin-dev/host-api` — a layout that no longer
 * exists — so the packaged app threw "host package source is not available in
 * this build" while shipping ~1 MB of unused sources. It is a pure function now
 * so the packaged layout is testable without Electron
 * (`packaged-studio-deps.test.mjs` guards exactly that).
 */
import { resolve } from 'node:path'

/**
 * Candidates for the "workspace root" — the directory that contains
 * `packages/<name>/package.json` for the host packages. Most specific first;
 * `resolveWorkspaceRoot` takes the first that looks right.
 *
 * @param {object} options
 * @param {string} [options.appPath] `app.getAppPath()` — the checkout root in
 *   dev, `<Resources>/app.asar` when packaged.
 * @param {string} [options.resourcesPath] `process.resourcesPath` — the packaged
 *   app's Resources directory.
 * @param {string} [options.moduleDir] `__dirname` of the calling module (the
 *   bundled main process lives deep inside `out/`, so a dev run can walk up).
 * @param {string} [options.cwd] `process.cwd()`.
 * @param {object} [options.env] `process.env` (`KN_WORKSPACE_ROOT` override).
 */
export const workspaceRootCandidates = ({ appPath, resourcesPath, moduleDir, cwd, env = {} } = {}) => {
    const candidates = []
    if (env?.KN_WORKSPACE_ROOT) candidates.push(env.KN_WORKSPACE_ROOT)

    if (appPath) {
        // Dev: appPath is the checkout root, so its parents are the candidates.
        candidates.push(resolve(appPath, '..', '..'), resolve(appPath, '..'), appPath)
    }

    if (resourcesPath) {
        // Packaged: a plain directory outside app.asar, located through
        // process.resourcesPath — no `..` counting, no asar path rewriting.
        candidates.push(resolve(resourcesPath, 'kn-studio-runtime', 'host-api'))
    }

    if (moduleDir) {
        // Bundled dev entry: `out/main/plugin-dev` → the repo root.
        candidates.push(resolve(moduleDir, '..', '..', '..', '..'))
    }

    if (appPath) {
        // Legacy packaged layout (before the kn-studio-runtime move). Kept for
        // older installers; it simply never matches on current builds.
        candidates.push(
            resolve(appPath, '..', 'app.asar.unpacked', 'out', 'main', 'plugin-dev', 'host-api'),
        )
    }

    if (cwd) {
        candidates.push(resolve(cwd, '..'), resolve(cwd, '..', '..'), cwd)
    }

    return candidates
}
