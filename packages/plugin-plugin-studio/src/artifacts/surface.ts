/**
 * Plugin Studio — its agent surface as data.
 *
 * The kernel derives "what did this conversation produce?" from the transcript,
 * by running each tool's `artifactFromResult` mapper over the (sanitized) result
 * (see `@kn/common` ai/kernel/agent-artifact-collect). That is how a build lands
 * in the artifacts shelf and becomes the conversation's working target.
 *
 * Everything in this file is pure and React-free on purpose: `index.tsx` pulls
 * the whole React tree, so the declaration lives here where a check can pin it
 * against the tool surface without rendering anything. The components
 * (conversation cards, side-pane preview) live next to it and only render the
 * view models defined here.
 *
 * Scope: only tools that PRODUCE something get a mapper. Reads
 * (`listPluginProjectFiles`, `pluginProjectLogs`, `searchHostApi`, …) are
 * discovery, not targets — mapping them would fill the shelf with noise.
 */

/* ------------------------------------------------------------------ *
 * Structural contract (this module stays runtime-dependency-free)
 * ------------------------------------------------------------------ */

/** Structural copy of `@kn/common`'s `AgentArtifact`. */
export interface StudioArtifact {
    kind: string
    id: string
    title?: string
    subtitle?: string
    data?: unknown
}

export type StudioArtifactMapper = (result: unknown, args: unknown) => StudioArtifact | null

/** Artifact kinds the studio contributes. Pinned by the surface check. */
export const PLUGIN_BUILD_KIND = 'plugin-build'
export const PLUGIN_PROJECT_KIND = 'plugin-project'
export const PLUGIN_ICON_KIND = 'plugin-icon'

/**
 * Tools whose result is a build of a project (the artifact a dev loop produces).
 * `publishPluginProject` maps here too: publishing is the same artifact leaving
 * the machine, so it updates the same shelf slot instead of adding a second one.
 */
export const BUILD_ARTIFACT_TOOLS = ['runPluginProject', 'buildPluginProject', 'publishPluginProject'] as const

/** Tools whose result is a source project. */
export const PROJECT_ARTIFACT_TOOLS = ['createPluginProject'] as const

/** Tools whose result is the plugin's own icon. */
export const ICON_ARTIFACT_TOOLS = ['generatePluginIcon'] as const

/**
 * List payload caps. Artifacts travel inside the transcript and are copied into
 * the shelf, so they stay small: counts are kept, long lists are not.
 */
const MAX_MODULES = 24
const MAX_FILES = 24

/* ------------------------------------------------------------------ *
 * Result parsing (shared by the mappers, the cards and the pane)
 * ------------------------------------------------------------------ */

export interface StudioPublishedView {
    /** `submit` (上架) or `version` (发布新版本). */
    mode: string
    version?: string
    pluginId?: string | number
    resourcePath?: string
}

/** One build/run/publish result, normalized for rendering. */
export interface StudioBuildView {
    ok: boolean
    error?: string
    root: string
    pluginKey?: string
    name?: string
    state?: string
    buildCount?: number
    bytes?: number
    durationMs?: number
    modules: string[]
    moduleCount: number
    installed: boolean
    externals: string[]
    published?: StudioPublishedView
}

/** One `createPluginProject` result, normalized for rendering. */
export interface StudioProjectView {
    ok: boolean
    error?: string
    root: string
    pluginKey?: string
    displayName?: string
    template: string
    managed: boolean
    files: string[]
    fileCount: number
}

/** One `generatePluginIcon` result, normalized for rendering. */
export interface StudioIconView {
    ok: boolean
    root: string
    /** The emoji (or letter) that was drawn. */
    glyph: string
    isInitial: boolean
    color?: string
    /** Project-relative path of the generated artwork. */
    relativePath: string
    /** The SVG source, when the result carried it. */
    svg?: string
    /** Whether the source rail icon was swapped to the same glyph. */
    railUpdated: boolean
    /** Why it was not, when it was not. */
    railStatus?: string
    /** The snippet to paste when the source was not touched. */
    railSnippet?: string
    /** The icon the manifest declared before. */
    previousIcon?: string | null
}

const readRecord = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const readString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.length > 0 ? value : undefined

const readNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined

const readStringList = (value: unknown, max: number): { items: string[]; total: number } => {
    if (!Array.isArray(value)) return { items: [], total: 0 }
    const all = value.filter((entry): entry is string => typeof entry === 'string')
    return { items: all.slice(0, max), total: all.length }
}

/** Last path segment, for a readable fallback title. */
export const baseName = (value: string): string =>
    value.split(/[\\/]/).filter(Boolean).pop() ?? value

/**
 * Parse a build/run/publish result (plus the call's args, which carry `root`
 * for `publishPluginProject`). Returns null only when there is no project to
 * point at; a *failed* build still yields a view, so the card can show the
 * compiler error.
 */
export const readBuildView = (result: unknown, args?: unknown): StudioBuildView | null => {
    const value = readRecord(result)
    const request = readRecord(args)
    const root = readString(value.root) ?? readString(request.root)
    if (!root) return null

    const modules = readStringList(value.modules, MAX_MODULES)
    const externals = readStringList(value.externals, MAX_MODULES)
    const mode = readString(value.mode)
    const published: StudioPublishedView | undefined = mode
        ? {
              mode,
              version: readString(value.version),
              pluginId:
                  typeof value.pluginId === 'string' || typeof value.pluginId === 'number'
                      ? value.pluginId
                      : undefined,
              resourcePath: readString(value.resourcePath),
          }
        : undefined

    return {
        ok: value.ok === true,
        error: readString(value.error),
        root,
        pluginKey: readString(value.pluginKey),
        name: readString(value.name),
        state: readString(value.state),
        buildCount: readNumber(value.buildCount),
        bytes: readNumber(value.bytes),
        durationMs: readNumber(value.durationMs),
        modules: modules.items,
        moduleCount: modules.total,
        installed: value.installed === true,
        externals: externals.items,
        published,
    }
}

/** Parse a `createPluginProject` result. */
export const readProjectView = (result: unknown, args?: unknown): StudioProjectView | null => {
    const value = readRecord(result)
    const request = readRecord(args)
    const root = readString(value.root) ?? readString(request.root)
    if (!root) return null

    const files = readStringList(value.files, MAX_FILES)
    return {
        ok: value.ok === true,
        error: readString(value.error),
        root,
        pluginKey: readString(value.pluginKey) ?? readString(request.pluginKey),
        displayName: readString(request.displayName),
        template: readString(value.template) ?? readString(request.template) ?? 'panel',
        managed: value.managed === true,
        files: files.items,
        fileCount: files.total,
    }
}

/** The human title of a build artifact (used by both the mapper and the pane). */
export const buildArtifactTitle = (view: StudioBuildView): string =>
    view.name ?? view.pluginKey ?? baseName(view.root)

/** Parse a `generatePluginIcon` result. */
export const readIconView = (result: unknown): StudioIconView | null => {
    const value = readRecord(result)
    const root = readString(value.root)
    const glyph = readString(value.glyph)
    const relativePath = readString(value.relativePath)
    if (!root || !glyph || !relativePath) return null
    const rail = readRecord(value.railIcon)
    const manifest = readRecord(value.manifest)
    return {
        ok: value.ok === true,
        root,
        glyph,
        isInitial: value.isInitial === true,
        color: readString(value.color),
        relativePath,
        svg: readString(value.svg),
        railUpdated: rail.updated === true,
        railStatus: readString(rail.status),
        railSnippet: readString(rail.snippet),
        previousIcon: typeof manifest.previous === 'string' ? manifest.previous : null,
    }
}

/* ------------------------------------------------------------------ *
 * Artifact mappers
 * ------------------------------------------------------------------ */

/**
 * A successful build/run/publish becomes one artifact per PROJECT (id = root):
 * rebuilding updates the existing shelf slot instead of stacking a new one,
 * which is what "the artifact this conversation is working on" means for a
 * hot-reload loop. A failed build maps to null — it produced nothing to open,
 * and the conversation card still renders the error.
 */
export const buildArtifactFromResult: StudioArtifactMapper = (result, args) => {
    const view = readBuildView(result, args)
    if (!view || !view.ok) return null

    return {
        kind: PLUGIN_BUILD_KIND,
        id: view.root,
        title: buildArtifactTitle(view),
        subtitle: view.published
            ? view.published.version
                ? `v${view.published.version}`
                : view.published.mode
            : view.buildCount !== undefined
              ? `#${view.buildCount}`
              : undefined,
        data: {
            root: view.root,
            pluginKey: view.pluginKey ?? null,
            name: view.name ?? null,
            state: view.state ?? null,
            buildCount: view.buildCount ?? null,
            bytes: view.bytes ?? null,
            durationMs: view.durationMs ?? null,
            modules: view.modules,
            moduleCount: view.moduleCount,
            installed: view.installed,
            published: view.published ?? null,
        },
    }
}

/** A created project becomes a `plugin-project` artifact (the source target). */
export const projectArtifactFromResult: StudioArtifactMapper = (result, args) => {
    const view = readProjectView(result, args)
    if (!view || !view.ok) return null

    return {
        kind: PLUGIN_PROJECT_KIND,
        id: view.root,
        title: view.displayName ?? view.pluginKey ?? baseName(view.root),
        subtitle: view.template,
        data: {
            root: view.root,
            pluginKey: view.pluginKey ?? null,
            displayName: view.displayName ?? null,
            template: view.template,
            managed: view.managed,
            files: view.files,
            fileCount: view.fileCount,
        },
    }
}

/**
 * A generated icon becomes a `plugin-icon` artifact.
 *
 * One slot per project, like the build: regenerating the icon (a different
 * glyph, a new colour) updates that slot instead of stacking images. The SVG
 * travels in `data` so the shelf and the pane can show it without reading the
 * file back from disk.
 */
export const iconArtifactFromResult: StudioArtifactMapper = (result, args) => {
    const view = readIconView(result)
    if (!view || !view.ok) return null

    const name = readString(readRecord(args).name)
    return {
        kind: PLUGIN_ICON_KIND,
        id: view.root,
        title: name ?? baseName(view.root),
        subtitle: view.glyph,
        data: {
            root: view.root,
            glyph: view.glyph,
            isInitial: view.isInitial,
            color: view.color ?? null,
            relativePath: view.relativePath,
            svg: view.svg ?? null,
            railUpdated: view.railUpdated,
            railStatus: view.railStatus ?? null,
            railSnippet: view.railSnippet ?? null,
            previousIcon: view.previousIcon ?? null,
        },
    }
}

/**
 * The mapper table the tool definitions attach to.
 *
 * The plugin lifts it onto its tool defs in `index.tsx`, so the kernel keys each
 * mapper by the tool's wire name — no name is written down twice.
 */
export const STUDIO_ARTIFACT_MAPPERS: Record<string, StudioArtifactMapper> = {
    createPluginProject: projectArtifactFromResult,
    runPluginProject: buildArtifactFromResult,
    buildPluginProject: buildArtifactFromResult,
    publishPluginProject: buildArtifactFromResult,
    generatePluginIcon: iconArtifactFromResult,
}

/** Artifact kinds the studio can render in the side pane. */
export const STUDIO_ARTIFACT_KINDS = [PLUGIN_BUILD_KIND, PLUGIN_PROJECT_KIND, PLUGIN_ICON_KIND] as const

/**
 * The snapshot the mapper stored on an artifact, read back for the side pane.
 *
 * Two paths reach the pane and only one of them carries `data`:
 *  - the shelf / a card opens the artifact the mapper produced (`data` present);
 *  - the model calls the host's `focusArtifact({ kind, id })`, which reconstructs
 *    a bare artifact from kind + id and has no payload.
 *
 * So `root` falls back to the artifact id (the mapper's identity IS the project
 * root) and every other field is optional: the pane live-loads whatever the
 * snapshot is missing.
 */
export interface StudioArtifactSnapshot {
    root: string
    pluginKey?: string
    name?: string
    displayName?: string
    state?: string
    buildCount?: number
    bytes?: number
    durationMs?: number
    modules: string[]
    moduleCount: number
    installed: boolean
    published?: StudioPublishedView
    template?: string
    managed?: boolean
    files: string[]
    fileCount: number
    /** `plugin-icon` payload: the artwork and how it was applied. */
    icon?: {
        glyph: string
        isInitial: boolean
        color?: string
        relativePath: string
        svg?: string
        railUpdated: boolean
        railStatus?: string
        railSnippet?: string
        previousIcon: string | null
    }
}

export const readArtifactSnapshot = (artifact: StudioArtifact | null | undefined): StudioArtifactSnapshot | null => {
    if (!artifact) return null
    const data = readRecord(artifact.data)
    const root = readString(data.root) ?? readString(artifact.id)
    if (!root) return null

    const modules = readStringList(data.modules, MAX_MODULES)
    const files = readStringList(data.files, MAX_FILES)
    const mode = readString((readRecord(data.published) as Record<string, unknown>).mode)
    const publishedData = readRecord(data.published)

    return {
        root,
        pluginKey: readString(data.pluginKey) ?? undefined,
        name: readString(data.name) ?? undefined,
        displayName: readString(data.displayName) ?? undefined,
        state: readString(data.state) ?? undefined,
        buildCount: readNumber(data.buildCount),
        bytes: readNumber(data.bytes),
        durationMs: readNumber(data.durationMs),
        modules: modules.items,
        moduleCount: modules.total,
        installed: data.installed === true,
        published: mode
            ? {
                  mode,
                  version: readString(publishedData.version),
                  pluginId:
                      typeof publishedData.pluginId === 'string' || typeof publishedData.pluginId === 'number'
                          ? publishedData.pluginId
                          : undefined,
                  resourcePath: readString(publishedData.resourcePath),
              }
            : undefined,
        template: readString(data.template) ?? undefined,
        managed: typeof data.managed === 'boolean' ? data.managed : undefined,
        files: files.items,
        fileCount: files.total,
        icon: readString(data.glyph) && readString(data.relativePath)
            ? {
                  glyph: readString(data.glyph) as string,
                  isInitial: data.isInitial === true,
                  color: readString(data.color),
                  relativePath: readString(data.relativePath) as string,
                  svg: readString(data.svg),
                  railUpdated: data.railUpdated === true,
                  railStatus: readString(data.railStatus),
                  railSnippet: readString(data.railSnippet),
                  previousIcon: typeof data.previousIcon === 'string' ? data.previousIcon : null,
              }
            : undefined,
    }
}

