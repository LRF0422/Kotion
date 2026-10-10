import { merge } from "lodash";
import { ExtensionWrapper } from "./editor";
import { DockPanelConfig, DockPosition, ResolvedDockPanel } from "./dock";
import { PageTypeConfig, ResolvedPageType } from "./page-type";
import { SiderMenuItemProps } from "./menu";
import { TourConfig } from "./tour";
import { RouteConfig } from "./route";
import { Services } from "./types";
import {
    ServiceRegistry,
    type ServiceRegistryView,
    pluginServiceOwner,
    CORE_SERVICE_OWNER,
} from "./ServiceRegistry";
import { normalizePluginName, PluginMeta, PluginRegistration } from "./global-namespace";
import {
    getRemotePluginInputName,
    normalizeRemotePluginDescriptor,
    type RemotePluginDescriptor,
    type RemotePluginInput,
} from "./plugin-runtime";
import type { PluginManagementEntry, PluginSource } from "./plugin-management";
import { pluginScriptLoader, peekPluginRegistration } from "../utils/import-util";
import { HotComponentRegistry } from "./plugin-hot-component";
import type { PluginBundle, PluginInstallOutcome } from "./plugin-bundle";
import { logger } from "../utils/logger";
import { event, PLUGIN_INCOMPATIBLE } from "../event";
import { Editor } from "@tiptap/core";
import {
    agentScopeMatches,
    filterContributionByScope,
    getAgentToolImplementation,
    isAgentContextAllowed,
    resolveAgentToolNames,
    toAgentWireName,
} from "../ai/plugin-agent";import type {
    AgentContribution,
    AgentScope,
    AgentSkillDefinition,
    AgentToolContext,
    AgentToolDefinition,
    ResolvedAgentCapabilities,
    ResolvedAgentContribution,
    ResolvedAgentScope,
    ResolvedAgentSkill,
} from "../ai/plugin-agent";

export interface PluginSettingsConfig {
    /**
     * Unique key for the settings panel
     */
    key: string;
    /**
     * Display name for the settings panel
     */
    label: string;
    /**
     * Icon component for the settings panel
     */
    icon?: React.ReactNode;
    /**
     * Settings component to render.
     * Receives an optional `pluginKey` prop for config persistence.
     */
    component: React.ComponentType<{ pluginKey?: string }>;
    /**
     * Description of the settings panel
     */
    description?: string;
}

/**
 * One plugin's instantiated agent tools: the plugin's kernel-facing tools
 * (contribution-level `agent.tools` / `agent.include`), advertised to the
 * kernel agent.
 */
export interface ResolvedPluginToolGroup {
    pluginName: string
    tools: Record<string, any>
}

export interface PluginConfig {
    name: string
    status: string
    routes?: RouteConfig[]
    globalRoutes?: RouteConfig[]
    menus?: SiderMenuItemProps[]
    editorExtension?: ExtensionWrapper[]
    locales?: any
    services?: Services
    /**
     * Plugin settings configuration
     */
    settings?: PluginSettingsConfig
    /**
     * Onboarding/feature tours contributed by this plugin.
     * Aggregated by PluginManager.resolveTours().
     */
    tours?: TourConfig[]
    /**
     * Side-dock panels contributed by this plugin (relation graph, outline, …).
     * Aggregated by PluginManager.resolveDockPanels(); installing/uninstalling
     * the plugin adds/removes its rail icon at runtime.
     */
    dockPanels?: DockPanelConfig[]
    /**
     * Stable page renderers contributed by this plugin.
     * Aggregated by PluginManager.resolvePageTypes().
     */
    pageTypes?: PageTypeConfig[]
    /**
     * Agent tools this plugin adds to the model's catalog — the plugin's agent
     * surface, declared at the top level next to its menus and routes. Nothing
     * here is editor-bound: a tool that needs an editor declares its `scope`; a
     * tool that does not is registered with `scope: 'any'`. Installing the plugin
     * adds these tools, uninstalling removes them. Author them in the extension
     * shape and lift with {@link liftLegacyTools}, or hand over an
     * `AgentToolDefinition` directly.
     */
    tools?: AgentToolDefinition[]
    /**
     * Skills shipped with this plugin: a prompt fragment plus the tool names it
     * owns. The fragment tells the model when and how to use those tools — and
     * because it names them, their schemas can be delivered on demand instead of
     * riding in every request.
     */
    skills?: AgentSkillDefinition[]
    /**
     * The rest of the agent contribution: core implementations this plugin
     * exposes (`include`), context providers, actions, and the card renderers for
     * tool results / artifacts. `agent.tools` / `agent.skills` still load but are
     * deprecated — declare those two at the top level.
     */
    agent?: AgentContribution
    /**
     * True when the plugin needs desktop (Electron) capabilities. Surfaced to
     * the marketplace so it can mark the plugin desktop-only and, on the web,
     * refuse to install it.
     */
    desktopOnly?: boolean
}

export class KPlugin<T extends PluginConfig> {

    name: string
    pluginKey: string = ""
    private _routes?: RouteConfig[]
    private _globalRoutes?: RouteConfig[]
    private _editorExtension?: ExtensionWrapper[]
    private _menus?: SiderMenuItemProps[]
    private _locales?: any
    private _services?: Services
    private _settings?: PluginSettingsConfig
    private _tours?: TourConfig[]
    private _dockPanels?: DockPanelConfig[]
    private _pageTypes?: PageTypeConfig[]
    private _tools?: AgentToolDefinition[]
    private _skills?: AgentSkillDefinition[]
    private _agent?: AgentContribution
    private _desktopOnly?: boolean

    constructor(config: T) {
        this.name = config.name
        this._routes = config.routes
        this._globalRoutes = config.globalRoutes
        this._editorExtension = config.editorExtension
        this._menus = config.menus
        this._locales = config.locales
        this._services = config.services
        this._settings = config.settings
        this._tours = config.tours
        this._dockPanels = config.dockPanels
        this._pageTypes = config.pageTypes
        this._tools = config.tools
        this._skills = config.skills
        this._agent = config.agent
        this._desktopOnly = config.desktopOnly
    }

    /** Whether this plugin needs desktop (Electron) capabilities. */
    get desktopOnly(): boolean {
        return Boolean(this._desktopOnly)
    }

    get routes(): RouteConfig[] {
        return this._routes || []
    }

    /** Agent tools this plugin contributes (top-level `tools`). */
    get tools(): AgentToolDefinition[] {
        return this._tools || []
    }

    /** Skills shipped with this plugin (top-level `skills`). */
    get skills(): AgentSkillDefinition[] {
        return this._skills || []
    }

    get editorExtensions(): ExtensionWrapper[] {
        return this._editorExtension || []
    }

    get menus(): SiderMenuItemProps[] {
        return this._menus || []
    }

    get locales(): any {
        return this._locales
    }

    get services(): Services | undefined {
        return this._services
    }

    get settings(): PluginSettingsConfig | undefined {
        return this._settings
    }

    get tours(): TourConfig[] {
        return this._tours || []
    }

    get dockPanels(): DockPanelConfig[] {
        return this._dockPanels || []
    }

    get pageTypes(): PageTypeConfig[] {
        return this._pageTypes || []
    }

    /** Kernel agent contribution declared by this plugin. */
    get agent(): AgentContribution | undefined {
        return this._agent
    }

    /**
     * Rewrite every component this plugin contributes through `mapper`.
     *
     * **The one place that knows which parts of a config are components.** The
     * host uses it at activation to hand React a *stable* function per
     * contribution (see `plugin-hot-component.tsx`): the new implementation is
     * swapped behind an identity React already mounted, so a hot reload
     * re-renders a panel instead of unmounting it.
     *
     * Doing it here — once, generically — is what makes the coverage complete and
     * future-proof: a contribution point added below is wrapped automatically,
     * whereas the previous design wrapped at each `resolve*()` call site and had
     * silently missed the agent renderers and every editor-extension component.
     *
     * `kind` + the contribution's own id form the slot key, so identity is stable
     * across reloads *and* across a project renaming itself.
     */
    mapComponents(mapper: (kind: string, id: string, component: unknown) => unknown): void {
        const mapList = <I>(
            kind: string,
            items: I[] | undefined,
            id: (item: I) => string,
            read: (item: I) => unknown,
            write: (item: I, value: unknown) => void,
        ): void => {
            for (const item of items ?? []) {
                const component = read(item)
                if (!component) continue
                write(item, mapper(kind, id(item), component))
            }
        }
        // Dock panels: the developer's most-used contribution.
        mapList('dockPanel', this._dockPanels, panel => panel.id, panel => panel.component,
            (panel, value) => { panel.component = value as DockPanelConfig['component'] })

        // Page renderers (only the `component` flavour owns a React component).
        mapList('pageType', this._pageTypes, pageType => pageType.id,
            pageType => (pageType.renderer?.type === 'component' ? pageType.renderer.component : undefined),
            (pageType, value) => {
                if (pageType.renderer?.type === 'component') pageType.renderer.component = value as never
            })

        // The settings panel (one per plugin).
        if (this._settings?.component) {
            this._settings.component = mapper('settings', this._settings.key, this._settings.component) as never
        }

        // Conversation cards and side-sheet previews contributed by the plugin.
        mapList('toolRenderer', this._agent?.toolRenderers, renderer => renderer.tool,
            renderer => renderer.render, (renderer, value) => { renderer.render = value as never })
        mapList('artifactRenderer', this._agent?.artifactRenderers, renderer => renderer.kind,
            renderer => renderer.render, (renderer, value) => { renderer.render = value as never })

        /**
         * Routes contribute an *element* (`element: <Page />`), not a component, so
         * the stable identity has to be installed on the element's `type`. Spreading
         * is safe: React elements are frozen in development, and the spread keeps
         * `$$typeof`, `key` and `props` — the result is the same element with a
         * different component.
         *
         * One wrapper per component: a plugin may point several routes at one page
         * (the API client points two paths at `ApiClientPage`), and each route
         * getting its own identity would remount the page when navigating between
         * them.
         */
        const routeIdentity = new WeakMap<object, unknown>()
        const wrapRouteElement = (element: unknown, path: string): unknown => {
            if (!element || typeof element !== 'object') return element
            const candidate = element as { $$typeof?: unknown; type?: unknown }
            // Only plain function components: an element's `type` is legitimately a
            // host tag, a Fragment or a context provider, and a component wrapper is
            // invalid for those.
            if (typeof candidate.type !== 'function') return element
            const original = candidate.type as object
            let wrapped = routeIdentity.get(original)
            if (wrapped === undefined) {
                wrapped = mapper('route', path, candidate.type)
                routeIdentity.set(original, wrapped)
            }
            return wrapped === candidate.type ? element : { ...element, type: wrapped }
        }
        const mapRouteElements = (routes: RouteConfig[] | undefined): void => {
            for (const route of routes ?? []) {
                if (route.element) route.element = wrapRouteElement(route.element, route.path) as never
                if (route.children?.length) mapRouteElements(route.children)
            }
        }
        mapRouteElements(this._routes)
        mapRouteElements(this._globalRoutes)

        // Editor-extension components: slash/menu surfaces, bubbles, floating UI
        // and page footers. Tiptap extensions themselves are not components.
        for (const extension of this._editorExtension ?? []) {
            const name = extension.name || 'extension'
            const scalar: Array<[string, keyof ExtensionWrapper]> = [
                ['editorBubble', 'bubbleMenu'],
                ['editorFloating', 'floatingUI'],
                ['editorFooter', 'pageFooter'],
            ]
            for (const [kind, field] of scalar) {
                const current = extension[field] as unknown
                if (!current) continue
                if (Array.isArray(current)) {
                    extension[field] = current.map((entry, index) =>
                        mapper(kind, `${name}[${index}]`, entry)) as never
                } else {
                    extension[field] = mapper(kind, name, current) as never
                }
            }
            for (const [kind, field] of [
                ['editorMenu', 'menuConfig'],
                ['editorFloatingMenu', 'flotMenuConfig'],
            ] as Array<[string, keyof ExtensionWrapper]>) {
                const entries = extension[field] as Array<Record<string, unknown>> | undefined
                if (!Array.isArray(entries)) continue
                entries.forEach((entry, index) => {
                    const key = kind === 'editorMenu' ? 'menu' : undefined
                    if (key && entry[key]) entry[key] = mapper(kind, `${name}[${index}]`, entry[key])
                })
            }
            const slash = extension.slashConfig as Array<Record<string, unknown>> | undefined
            if (Array.isArray(slash)) {
                slash.forEach((entry, index) => {
                    if (entry && entry.render) entry.render = mapper('editorSlash', `${name}[${index}]`, entry.render)
                })
            }
        }
    }

}

export interface PluginManagerOptions {
    /** Maps a plugin's resourcePath to the (public, no-auth) download URL */
    resolveUrl: (resourcePath: string) => string
    /** The plugin API version the host was built with (from @kn/plugin-api) */
    hostApiVersion: string
    /** Application-owned services that plugins cannot replace. */
    coreServices?: Partial<Services>
    /**
     * How long a single plugin script may take to load before the request is
     * aborted and the plugin is reported through `failedPlugins` (ms).
     * Bounds one bad artifact; it never fails initialization.
     * @default 10000
     */
    loadTimeoutMs?: number
    /**
     * Hard budget for the whole remote-plugin loading phase (ms). Plugins that
     * have not settled by then are abandoned and reported through
     * `failedPlugins`, so `init()` always resolves and the host can boot with
     * whatever did load. A non-positive value disables the budget.
     * @default 15000
     */
    bootstrapTimeoutMs?: number
}

export interface PluginApiIncompatibility {
    name: string
    pluginKey?: string
    versionId?: string | number
    version?: string
    apiVersion: string
    hostApiVersion: string
}

export interface PluginInitResult {
    failedPlugins: string[]
    incompatiblePlugins: PluginApiIncompatibility[]
}

// The bundle/outcome contract lives in its own module: the core services and the
// studio both describe bundles, and neither should have to import the registry.
export type { PluginBundle, PluginInstallOutcome } from "./plugin-bundle";
/**
 * Install metadata for one active plugin.
 *
 * `source` is what decides whether a plugin can outlive a re-init: `system` and
 * `dev` plugins exist only in this runtime (host bundles and the plugin studio's
 * hot-reloaded builds), while `installed` plugins are entries in the server's
 * installed list and are replaced wholesale by it.
 */
interface ActivePluginMeta {
    /** Registry key. Duplicated from the entry so a metadata read is self-contained. */
    key: string
    /**
     * The name the *bundle* declared. Display only: it may be translated, so it
     * is never an identity (see `ActivePlugin.key`).
     */
    name: string
    /** The artifact/package key the plugin was declared with. */
    pluginKey: string
    version?: string
    source: PluginSource
    desktopOnly: boolean
    /** Dev builds: the project root, so a reload matches its own session. */
    sourceLabel?: string
}

/**
 * The registration the host namespace currently holds for one registry key.
 *
 * Never throws: a host without the global namespace (Node checks, SSR) simply
 * has no previous registration, which disables the stale-bundle detection.
 */
const previousPluginRegistration = (pluginKey: string): PluginRegistration | undefined => {
    try {
        return peekPluginRegistration(pluginKey)
    } catch {
        return undefined
    }
}

/** One active plugin: the instance, its identity, and its install metadata. */
interface ActivePlugin {
    /** Registry key (`pluginKey`) — the plugin's stable identity, everywhere. */
    key: string
    plugin: KPlugin<any>
    meta: ActivePluginMeta
}

/** One candidate that could not be activated, and why (a sentence for the caller). */
interface EntryConflict {
    key: string
    reason: string
}

/** What one commit changed: what left, and which candidates could not activate. */
interface CommitResult {
    /** Keys the commit removed. */
    removedKeys: string[]
    /** Candidates that were dropped (or kept without their services) and why. */
    conflicts: EntryConflict[]
    /** False when the commit was a no-op (same set, same instances). */
    changed: boolean
}

export class PluginManager {

    /**
     * The active plugin instances, in order.
     *
     * **Derived**: rebuilt by {@link _commit} from `_entries`. React consumers
     * read it (`usePluginState().plugins`) and its identity changing is what tells
     * them the registry moved.
     */
    plugins: KPlugin<any>[] = []
    _initialPlugins: KPlugin<any>[] = []
    private _serviceRegistry: ServiceRegistry
    private _serviceRegistryView: ServiceRegistryView
    private _resolveUrl: (resourcePath: string) => string
    private _hostApiVersion: string
    private _loadTimeoutMs: number
    private _bootstrapTimeoutMs: number
    _init: boolean = false

    // Version counter that increments whenever plugins change.
    // Used by React hooks (usePluginState, useEditorExtension) to detect changes
    // and trigger re-renders / editor reconfiguration.
    private _version: number = 0

    // Observable change listeners – a lightweight alternative to emitting events
    // from within the PluginManager. UI code subscribes via onChange().
    private _changeListeners = new Set<() => void>()

    // Cache for resolved plugin data to improve performance
    private _cacheRoutes: RouteConfig[] | null = null
    private _cacheMenus: SiderMenuItemProps[] | null = null
    private _cacheExtensions: ExtensionWrapper[] | null = null
    private _cacheLocales: any | null = null
    private _cacheTours: TourConfig[] | null = null
    private _cacheDockPanels: ResolvedDockPanel[] | null = null
    private _cachePageTypes: ResolvedPageType[] | null = null
    private _cacheAgentContributions: ResolvedAgentContribution[] | null = null

    /**
     * The registry — the *only* place the active set lives.
     *
     * Keyed by registry key (`pluginKey`), because that is the plugin's stable
     * identity: a bundle may translate its `name` (so one plugin has two strings
     * depending on the UI language) and a project's manifest carries a third. The
     * old design kept three parallel views (a list plus a by-name plugin map and
     * a by-name metadata map) that every lifecycle path had to update in step,
     * which is how "present in the map, missing from the list" states — and the
     * silent hot-reload failure where the studio asked for a plugin by a name it
     * was not running under — became possible.
     */
    private _entries = new Map<string, ActivePlugin>()
    /** Instance → key, so a resolve pass does not have to scan for it. */
    private _keyByInstance = new WeakMap<KPlugin<any>, string>()
    /**
     * The stylesheet each plugin last committed, so a *rejected* reload can put
     * it back. The bundle applies its own CSS while it is being evaluated (a
     * published UMD has to be self-contained), which is earlier than the commit —
     * this is what makes the style part of the transaction as well.
     */
    private _committedCss = new Map<string, string>()

    private _incompatiblePlugins = new Map<string, PluginApiIncompatibility>()
    /**
     * Registry keys the server's installed list contained at the end of the last
     * init. Together with the incoming list it tells {@link _runtimeLocalEntries}
     * which entries the server never supplied.
     */
    private _remotePluginKeys = new Set<string>()

    // Built-in dock panels contributed by the host itself (e.g. the AI agent
    // panel). Same contract as plugin-contributed panels; they simply cannot be
    // uninstalled. Keyed by panel id, insertion-ordered.
    private _coreDockPanels: Map<string, DockPanelConfig> = new Map()

    /**
     * Stable component identities for hot-reloaded contributions.
     *
     * Every component a plugin contributes is handed to React through this
     * registry, so a reload swaps the implementation behind an identity React
     * already knows instead of mounting a different component. See
     * `plugin-hot-component.tsx` for why that is what preserves panel state.
     */
    private _hotComponents = new HotComponentRegistry()

    constructor(options: PluginManagerOptions, initalPlugins: KPlugin<any>[]) {
        this._resolveUrl = options.resolveUrl
        this._hostApiVersion = options.hostApiVersion
        this._loadTimeoutMs = options.loadTimeoutMs ?? 10_000
        this._bootstrapTimeoutMs = options.bootstrapTimeoutMs ?? 15_000
        this._serviceRegistry = new ServiceRegistry(options.coreServices)
        this._serviceRegistryView = Object.freeze({
            get: <K extends keyof Services>(name: K) => this._serviceRegistry.get(name),
            getOwner: (name: keyof Services) => this._serviceRegistry.getOwner(name),
            has: (name: keyof Services) => this._serviceRegistry.has(name),
            getAll: () => this._serviceRegistry.getAll(),
            subscribe: (listener: (name: string) => void) => this._serviceRegistry.subscribe(listener),
        })
        this._initialPlugins = initalPlugins
        // Host plugins are part of the app from the first render, so their entries
        // exist before any lifecycle call. Committing here (rather than only
        // filling a map) keeps every view of the registry consistent from boot.
        const initial = new Map<string, ActivePlugin>()
        for (const plugin of initalPlugins) {
            initial.set(this._identityOf(plugin), {
                key: this._identityOf(plugin),
                plugin,
                meta: {
                    key: this._identityOf(plugin),
                    name: plugin.name,
                    pluginKey: plugin.pluginKey || this._identityOf(plugin),
                    source: 'system',
                    desktopOnly: plugin.desktopOnly,
                },
            })
        }
        this._commit(initial, 'boot', { silent: true })
        logger.debug('Initial plugins loaded:', this._initialPlugins)
    }

    /* ------------------------------------------------------------------ *
     * Identity
     * ------------------------------------------------------------------ */

    /**
     * The registry key of an instance: its declared `pluginKey`, else its name.
     *
     * A bundle's descriptor key always wins at activation (the manager is told it);
     * this is the fallback for host-bundled plugins, which only declare a name.
     */
    private _identityOf(plugin: KPlugin<any>): string {
        return plugin.pluginKey || plugin.name
    }

    /** Registry key for an instance already in the registry (O(1)). */
    private _keyOf(plugin: KPlugin<any>): string {
        return this._keyByInstance.get(plugin) ?? this._identityOf(plugin)
    }

    /**
     * Resolve a public identifier to a registry key.
     *
     * The key is the identity, but names are still accepted everywhere a caller
     * could pass one (a published plugin calling `pluginHost.uninstall(name)`, the
     * plugin manager UI, `getPlugin('PluginMain')`): key first, then the running
     * display name. Ambiguity is impossible in practice — a duplicate display name
     * is exactly the situation shadowing removes.
     */
    private _keyFor(identifier: string | undefined): string | undefined {
        if (!identifier) return undefined
        if (this._entries.has(identifier)) return identifier

        // Exact matches first: the runtime name the bundle declared, the name it
        // is filed under, and the artifact key.
        for (const [key, entry] of this._entries) {
            if (entry.meta.name === identifier || entry.plugin.name === identifier) return key
            if (entry.meta.pluginKey === identifier || entry.plugin.pluginKey === identifier) return key
        }

        /**
         * Then loosely, the same way the plugin loader resolves a registration
         * key: `@scope/plugin-api-client`, `plugin-api-client` and `api-client`
         * all name one plugin, and callers pass whichever one they happen to
         * have — a marketplace record's `name`, a package name, a menu key.
         *
         * This matters most for *uninstall*: the caller is a human clicking a
         * button, and silently refusing because the record's name is not the name
         * the bundle declared reads as "the plugin won't go away" (it stays active
         * with its menu, and the next install then collides with itself).
         */
        const target = normalizePluginName(identifier)
        if (!target) return undefined
        for (const [key, entry] of this._entries) {
            const candidates = [
                key,
                entry.meta.name,
                entry.meta.pluginKey,
                entry.plugin.name,
                entry.plugin.pluginKey,
            ]
            if (candidates.some(value => value && normalizePluginName(value) === target)) return key
        }
        return undefined
    }

    private _entryFor(identifier: string | undefined): ActivePlugin | undefined {
        const key = this._keyFor(identifier)
        return key ? this._entries.get(key) : undefined
    }

    /** Host-owned keys: part of the app, never installed from a bundle. */
    private _isInitialPluginKey(pluginKey?: string): boolean {
        return Boolean(pluginKey && this._initialPlugins.some(plugin => this._identityOf(plugin) === pluginKey))
    }

    /* ------------------------------------------------------------------ *
     * Plan → commit
     * ------------------------------------------------------------------ */

    /**
     * Service registrations for a candidate entry set, in render order.
     *
     * Ownership is by registry key, so a reload of one plugin can never look like
     * a foreign owner taking over its own services.
     */
    private _serviceRegistrations(entries: Map<string, ActivePlugin>) {
        return [...entries.values()]
            .filter(entry => entry.plugin.services)
            .map(entry => ({
                owner: pluginServiceOwner(entry.key, entry.plugin.name),
                services: entry.plugin.services!,
            }))
    }

    /**
     * Decide which candidate entries can actually activate.
     *
     * Pure, and the only place that answers "may this plugin run at all". Two
     * rules, both checked **before** anything is committed, so the registry can
     * never hold a plugin that is half-registered:
     *
     * 1. **One entry per plugin.** Two candidates may not describe the same plugin
     *    under two registry keys. They can: an artifact installed under a
     *    name-derived key, then offered again by the server with its `pluginKey`;
     *    or a key the developer edited in the manifest. Left alone, both activate —
     *    two instances of one plugin and two copies of its sidebar menu — and then
     *    `uninstall(name)` resolves to only one of them, which is exactly the
     *    "uninstalling does nothing, the menu keeps coming back" report. The first
     *    candidate wins, in render order (host → dev build → server list), which is
     *    also how a dev build shadows the published artifact.
     * 2. **Every declared service can be published.** A plugin whose service an
     *    earlier owner already holds is not activated (host plugins included), and
     *    that is reported: "active but missing its services" is the other
     *    half-committed state this plan exists to prevent.
     */
    private _planEntries(candidates: Map<string, ActivePlugin>): {
        accepted: Map<string, ActivePlugin>
        conflicts: EntryConflict[]
    } {
        const rejected = new Map<string, string>()

        /* -- rule 1: one entry per plugin ---------------------------------- *
         * Two candidates are the same plugin when they declare the same runtime
         * name, or the same `pluginKey`. Exact comparison, deliberately: the
         * *lookup* path is lenient (a caller may hand over any of a plugin's
         * names), but identity must not be — normalizing here would merge two
         * genuinely different plugins whose names differ only in punctuation or
         * non-ASCII characters. The first candidate in render order wins
         * (host → dev build → server list), and the loser is reported.
         */
        const survivors = new Map<string, ActivePlugin>()
        const namesTaken = new Map<string, ActivePlugin>()
        const keysTaken = new Map<string, ActivePlugin>()
        for (const entry of candidates.values()) {
            const name = (entry.meta.name || entry.plugin.name || '').trim()
            const declaredKey = (entry.meta.pluginKey || entry.plugin.pluginKey || '').trim()
            const owner = (name ? namesTaken.get(name) : undefined)
                ?? (declaredKey ? keysTaken.get(declaredKey) : undefined)
            if (owner && owner.key !== entry.key) {
                rejected.set(
                    entry.key,
                    `it is the same plugin as "${owner.meta.name}" (pluginKey "${owner.key}"), `
                    + 'which is already active',
                )
                continue
            }
            if (name) namesTaken.set(name, entry)
            if (declaredKey) keysTaken.set(declaredKey, entry)
            survivors.set(entry.key, entry)
        }

        /* -- rule 2: every declared service can be published --------------- */
        const plan = this._serviceRegistry.planPluginServices(this._serviceRegistrations(survivors))
        for (const conflict of plan.conflicts) {
            const names = conflict.names.map(String).join(', ')
            rejected.set(
                conflict.owner.pluginKey,
                `its service ${names} is already owned by another plugin`,
            )
        }

        const accepted = new Map([...survivors].filter(([key]) => !rejected.has(key)))
        const conflicts: EntryConflict[] = []
        for (const [key, reason] of rejected) {
            logger.error(`Plugin ${key} will not activate: ${reason}`)
            conflicts.push({ key, reason })
        }
        return { accepted, conflicts }
    }

    /**
     * The single mutation point of the plugin registry.
     *
     * Writes every derived view (the instance list, the key→instance index, the
     * metadata map users ask about, the render identity index), the plugin-owned
     * services, the resolve caches, the version counter and the listeners — in one
     * place, from one candidate set. Every lifecycle operation is therefore
     * "build the candidate entries, plan, commit"; there is no path that can
     * update one view and forget another, and no path that half-applies (an
     * entry that would lose its services is dropped by the plan first).
     */
    private _commit(
        next: Map<string, ActivePlugin>,
        reason: string,
        options: { silent?: boolean } = {},
    ): CommitResult {
        const { accepted, conflicts } = this._planEntries(next)

        const removedKeys: string[] = []
        for (const key of this._entries.keys()) {
            if (!accepted.has(key)) removedKeys.push(key)
        }

        const nextEntries = new Map(accepted)
        const nextPlugins = [...accepted.values()].map(entry => entry.plugin)
        const changed = !options.silent
            && (removedKeys.length > 0
                || nextEntries.size !== this._entries.size
                || nextPlugins.some((plugin, index) => this.plugins[index] !== plugin))

        this._entries = nextEntries
        this.plugins = nextPlugins
        this._keyByInstance = new WeakMap()
        for (const [key, entry] of nextEntries) this._keyByInstance.set(entry.plugin, key)

        this._serviceRegistry.applyPluginServices(
            this._serviceRegistry.planPluginServices(this._serviceRegistrations(nextEntries)),
        )

        // A removed plugin's render identities go with it: installing it again is
        // a mount, not a reload, so its state should start over.
        for (const key of removedKeys) this._hotComponents.release(key)

        if (!options.silent) {
            logger.debug(`plugin registry committed (${reason}): ${nextEntries.size} plugin(s)`)
            this._notifyChange()
        }
        return { removedKeys, conflicts, changed }
    }

    /**
     * Get the current plugin version counter.
     * This value changes every time plugins are added, removed, or re-initialized.
     * Use this as a React hook dependency to detect plugin changes.
     */
    get version(): number {
        return this._version
    }

    get incompatiblePlugins(): PluginApiIncompatibility[] {
        return [...this._incompatiblePlugins.values()]
    }

    /** Registry keys of every active plugin — the identity-bearing list. */
    getAllPluginKeys(): string[] {
        return [...this._entries.keys()]
    }

    /**
     * Live stable component identities, one per hot-reloadable contribution
     * (`generation` counts the implementations that identity has carried).
     *
     * Diagnostics: the studio and its tests use it to prove that a reload kept a
     * panel's identity instead of mounting a new component.
     */
    getHotComponentStats() {
        return this._hotComponents.stats()
    }

    /**
     * Subscribe to plugin state changes.
     * The listener is called every time the plugin list changes (init, install, uninstall, remove).
     * @returns An unsubscribe function.
     */
    onChange(listener: () => void): () => void {
        this._changeListeners.add(listener)
        return () => { this._changeListeners.delete(listener) }
    }

    /**
     * Registry entries the server never supplied: the plugin studio's
     * hot-reloaded dev builds, and plugins an install activated while an init
     * was still in flight. Neither is in `_initialPlugins` nor in the server's
     * installed list, so a re-init that rebuilt the registry from that list
     * could never bring them back — it has to carry them across.
     *
     * A `dev` entry is authoritative for its registry key (it shadows the
     * published artifact the developer is iterating on). An `installed` entry is
     * only runtime-local while the server has never listed it: once it does, the
     * server owns that key and the next init reloads it from there.
     *
     * @param incomingKeys keys in the installed list this init is about to load.
     */
    private _runtimeLocalEntries(incomingKeys: ReadonlySet<string> = new Set()): ActivePlugin[] {
        const local: ActivePlugin[] = []
        this._entries.forEach((entry, key) => {
            if (entry.meta.source === 'system') return
            if (entry.meta.source === 'installed' && (this._remotePluginKeys.has(key) || incomingKeys.has(key))) {
                return
            }
            local.push(entry)
        })
        return local
    }

    /**
     * Invalidate internal derived-data caches and notify listeners.
     */
    private _notifyChange() {
        this._cacheRoutes = null
        this._cacheMenus = null
        this._cacheExtensions = null
        this._cacheLocales = null
        this._cacheTours = null
        this._cacheDockPanels = null
        this._cachePageTypes = null
        this._cacheAgentContributions = null
        this._version++
        this._changeListeners.forEach(fn => fn())
    }

    /**
     * Clear the plugin script cache to ensure plugins are freshly loaded.
     * Call this before re-initializing plugins (after uninstall/update)
     * to avoid serving stale cached versions.
     */
    clearPluginCache() {
        pluginScriptLoader.invalidateAll()
        logger.info('Plugin script cache invalidated')
    }

    /**
     * Clear a specific plugin URL from the script cache.
     */
    clearPluginCacheByUrl(url: string) {
        pluginScriptLoader.invalidate(url)
        logger.info(`Plugin script cache invalidated for URL: ${url}`)
    }

    /**
     * Shape check for a plugin instance or descriptor.
     *
     * Collisions are *not* checked here any more: whether an incoming bundle is a
     * new plugin, a reload of one already active, or a shadowing dev build is a
     * question about the registry, answered by the plan (see {@link _planEntries}).
     */
    private _validatePlugin(plugin: { name?: string } | null | undefined): boolean {
        if (!plugin) {
            logger.error('Plugin is null or undefined')
            return false
        }
        if (!plugin.name) {
            logger.error('Plugin must have a name')
            return false
        }
        return true
    }

    /**
     * Build the script URL for a remote plugin. Publishing produces a new
     * resourcePath (new file name), so the extra `v` parameter is only a
     * second line of defence against stale HTTP caches.
     */
    private _buildPluginUrl(plugin: RemotePluginDescriptor): string {
        return this._resolveUrl(plugin.resourcePath)
            + '&cache=true'
            + '&v=' + (plugin.versionId ?? plugin.version ?? '')
    }

    private _pluginIdentity(plugin: RemotePluginDescriptor): string {
        return `${plugin.pluginKey}:${plugin.versionId ?? plugin.version ?? 'unknown'}`
    }

    private _clearPluginIncompatibility(plugin: { pluginKey?: string; name: string }): boolean {
        let cleared = false
        for (const [key, issue] of this._incompatiblePlugins) {
            const matches = plugin.pluginKey && issue.pluginKey
                ? plugin.pluginKey === issue.pluginKey
                : Boolean(plugin.name && plugin.name === issue.name)
            if (matches) {
                this._incompatiblePlugins.delete(key)
                cleared = true
            }
        }
        return cleared
    }

    /**
     * Version handshake: a plugin built against a different MAJOR plugin-api
     * version than the host is skipped. Legacy bundles without metadata are
     * allowed through with a warning.
     */
    private _getApiIncompatibility(
        meta: PluginMeta | undefined,
        plugin: RemotePluginDescriptor,
    ): PluginApiIncompatibility | null {
        const name = plugin.name
        const apiVersion = meta?.apiVersion
        if (!apiVersion) {
            logger.warn(`Plugin ${name} has no apiVersion metadata (legacy bundle), loading anyway`)
            return null
        }
        const pluginMajor = apiVersion.split('.')[0]
        const hostMajor = this._hostApiVersion.split('.')[0]
        if (pluginMajor !== hostMajor) {
            logger.warn(`Plugin ${name} is incompatible: built against plugin-api ${apiVersion}, host is ${this._hostApiVersion}. Skipping.`)
            event.emit(PLUGIN_INCOMPATIBLE, { name, apiVersion })
            return {
                name,
                pluginKey: plugin.pluginKey,
                versionId: plugin.versionId,
                version: plugin.version,
                apiVersion,
                hostApiVersion: this._hostApiVersion,
            }
        }
        return null
    }

    /**
     * Extract the KPlugin instance from a load result and sanity-check it
     * (name present, contract getters accessible) before activation.
     */
    private _extractPlugin(registration: PluginRegistration): KPlugin<any> | null {
        const plugin = Object.values(registration.exports)
            .find((value): value is KPlugin<any> => value instanceof KPlugin)
        if (!plugin) {
            logger.error('No KPlugin instance found in plugin exports')
            return null
        }
        try {
            if (!plugin.name) {
                logger.error('Plugin must have a non-empty name')
                return null
            }
            // Contract smoke test: getters must be accessible
            void plugin.routes
            void plugin.editorExtensions
            void plugin.pageTypes
        } catch (error) {
            logger.error('Plugin contract getters are not accessible:', error)
            return null
        }
        return plugin
    }

    /**
     * Wait for `promises` to settle, but never longer than `budgetMs`.
     * Returns `true` when every promise settled inside the budget, `false` when
     * the budget expired first. Rejections are absorbed: stragglers keep running
     * harmlessly and are ignored by the caller.
     */
    private async _settleWithin(promises: Promise<unknown>[], budgetMs: number): Promise<boolean> {
        const all = Promise.allSettled(promises).then(() => true)
        if (!Number.isFinite(budgetMs) || budgetMs <= 0) return all

        let timer: ReturnType<typeof setTimeout> | undefined
        try {
            return await Promise.race([
                all,
                new Promise<boolean>(resolve => {
                    timer = setTimeout(() => resolve(false), budgetMs)
                }),
            ])
        } finally {
            if (timer !== undefined) clearTimeout(timer)
        }
    }

    public async init(remotePlugins: readonly RemotePluginInput[]): Promise<PluginInitResult> {
        logger.info('Initializing remote plugins:', remotePlugins)
        logger.info('Current init status:', this._init)

        const isReinit = this._init

        // Keys this init is about to load from the server. Derived before the
        // reset so the preserved set can tell "the server owns this key" from
        // "this runtime installed it and the server has never heard of it".
        const incomingKeys = new Set(
            (remotePlugins ?? []).flatMap(input => {
                const plugin = normalizeRemotePluginDescriptor(input)
                return plugin ? [plugin.pluginKey] : []
            }),
        )
        // Snapshot the runtime-local entries *before* the reset: nothing in
        // `remotePlugins` can restore them afterwards.
        const localEntries = this._runtimeLocalEntries(incomingKeys)

        const failedPlugins = new Set<string>()
        const incompatiblePlugins = new Map<string, PluginApiIncompatibility>()

        const normalizedRemotePlugins = (remotePlugins ?? []).flatMap(input => {
            const plugin = normalizeRemotePluginDescriptor(input)
            if (plugin) return [plugin]
            const name = getRemotePluginInputName(input)
            failedPlugins.add(name)
            logger.warn(`Skipping remote plugin ${name}: missing name or resourcePath`)
            return []
        })
        const loadableRemotePlugins = normalizedRemotePlugins.filter(plugin => {
            if (!this._isInitialPluginKey(plugin.pluginKey)) return true
            logger.info(`Skipping remote plugin ${plugin.pluginKey}: already provided by the host`)
            return false
        })

        try {
            if (isReinit) {
                logger.info('PluginManager already initialized, resetting state for reinitialization')
                this._init = false
                // Remote plugins are being reloaded, not uninstalled: host plugins
                // and runtime-local entries stay active throughout, so the window
                // never flickers through an empty registry.
                this._remotePluginKeys = new Set()
                this._commit(
                    new Map(this._runtimeLocalEntries(new Set()).map(entry => [entry.key, entry])),
                    'reinit',
                )
                // Remote plugins must be fetched again, not served from the cache.
                this.clearPluginCache()
            }

            if (loadableRemotePlugins.length === 0) {
                // Nothing to sync against: the host's own plugins plus whatever
                // this runtime installed locally stay active, and everything the
                // server previously supplied stops being active. Registry and
                // active list are rebuilt by the same commit, so `hasPlugin()`
                // cannot outlive the menu entries it backs.
                const next = new Map<string, ActivePlugin>()
                for (const plugin of this._initialPlugins) {
                    next.set(this._identityOf(plugin), this._entryForPlugin(plugin, 'system'))
                }
                for (const entry of localEntries) next.set(entry.key, entry)
                const result = this._commit(next, 'init')
                this._remotePluginKeys = new Set()
                this._incompatiblePlugins = new Map()
                this._init = true
                logger.info('Plugins loaded:', this.plugins.length)
                logger.debug('Services loaded:', this._serviceRegistry.getAll())
                return {
                    failedPlugins: [...failedPlugins, ...result.conflicts.map(c => c.key)],
                    incompatiblePlugins: [],
                }
            }

            // Plugin boot is bounded and failure-isolated: a script that errors,
            // never answers, or exceeds its budget is reported through
            // `failedPlugins` and skipped. Initialization still resolves so the
            // host can start without it.
            const loadOutcomes = new Map<number, { registration: PluginRegistration } | { error: unknown }>()
            const loadPromises = loadableRemotePlugins.map((plugin, index) => {
                const path = this._buildPluginUrl(plugin)
                return pluginScriptLoader.load(path, plugin.pluginKey, plugin.name, {
                    integrity: plugin.integrity || undefined,
                    timeout: this._loadTimeoutMs,
                }).then(
                    registration => {
                        loadOutcomes.set(index, { registration })
                    },
                    error => {
                        logger.error(`Failed to load plugin ${plugin.name}:`, error)
                        loadOutcomes.set(index, { error })
                    },
                )
            })
            await this._settleWithin(loadPromises, this._bootstrapTimeoutMs)
            loadableRemotePlugins.forEach((plugin, index) => {
                const outcome = loadOutcomes.get(index)
                if (outcome) {
                    if ('error' in outcome) failedPlugins.add(plugin.name || plugin.pluginKey || 'unknown')
                    return
                }
                const name = plugin.name || plugin.pluginKey || 'unknown'
                failedPlugins.add(name)
                logger.warn(
                    `Plugin ${name} did not finish loading within ${this._bootstrapTimeoutMs}ms; ` +
                    'skipping it so the workspace can start'
                )
            })

            /**
             * The candidate registry: host plugins, then the runtime-local
             * entries no remote list can restore, then this round's remote
             * plugins. Insertion order is render order, and an existing key wins —
             * which is exactly how a dev build shadows the published artifact of
             * the same plugin until it is uninstalled.
             */
            const candidates = new Map<string, ActivePlugin>()
            for (const plugin of this._initialPlugins) {
                candidates.set(this._identityOf(plugin), this._entryForPlugin(plugin, 'system'))
            }
            const localForInit = this._runtimeLocalEntries(incomingKeys)
            for (const entry of localForInit) {
                candidates.set(entry.key, entry)
            }
            /**
             * Names a dev build is running under.
             *
             * A dev build shadows the published artifact of the same plugin by
             * *registry key* — and, deliberately, by display name too: the key the
             * studio passes comes from the project manifest, which the developer
             * may have edited (or published under an older one), and a published
             * copy must never end up fighting the build someone is iterating on.
             */
            const devNames = new Set(
                localForInit.filter(entry => entry.meta.source === 'dev').map(entry => entry.meta.name),
            )

            const activatedKeys = new Set<string>()
            loadableRemotePlugins.forEach((plugin, index) => {
                const outcome = loadOutcomes.get(index)
                if (!outcome || !('registration' in outcome)) return
                const { registration } = outcome
                const incompatibility = this._getApiIncompatibility(registration.meta, plugin)
                if (incompatibility) {
                    incompatiblePlugins.set(this._pluginIdentity(plugin), incompatibility)
                    return
                }
                const instance = this._extractPlugin(registration)
                if (!instance) {
                    logger.warn(`Invalid plugin ${plugin.name} detected, skipping`)
                    failedPlugins.add(plugin.name || plugin.pluginKey)
                    return
                }
                const key = plugin.pluginKey || this._identityOf(instance)
                if (candidates.has(key) || devNames.has(instance.name)) {
                    logger.info(
                        `Skipping plugin ${instance.name}: ${candidates.has(key) ? `${key} is already active` : 'a dev build is running under that name'}`,
                    )
                    return
                }
                candidates.set(key, this._entryForInstance(instance, 'installed', plugin))
                activatedKeys.add(key)
            })

            // A plugin that failed as *incompatible* but then activated from a
            // local entry of the same key is not incompatible after all.
            for (const [id, issue] of incompatiblePlugins) {
                if (issue.pluginKey && activatedKeys.has(issue.pluginKey)) incompatiblePlugins.delete(id)
            }

            const result = this._commit(candidates, isReinit ? 'reinit' : 'init')
            for (const conflict of result.conflicts) {
                failedPlugins.add(conflict.key)
            }

            this._incompatiblePlugins = incompatiblePlugins
            // Remember what the server listed, so a later init can tell its own
            // entries apart from the ones this runtime installed.
            this._remotePluginKeys = incomingKeys
            this._init = true

            logger.info(`All plugins loaded: ${this.plugins.length}`)
            logger.debug('Services loaded:', this._serviceRegistry.getAll())

            if (failedPlugins.size > 0) {
                logger.warn(`${failedPlugins.size} plugins failed to load or activate`)
            }
            if (incompatiblePlugins.size > 0) {
                logger.warn(`${incompatiblePlugins.size} plugins skipped because their API versions are incompatible`)
            }
            return {
                failedPlugins: [...failedPlugins],
                incompatiblePlugins: [...incompatiblePlugins.values()],
            }
        } catch (error) {
            logger.error('Fatal error during plugin initialization:', error)
            const preserved = new Map(
                this._runtimeLocalEntries(incomingKeys).map(entry => [entry.key, entry]),
            )
            for (const plugin of this._initialPlugins) {
                preserved.set(this._identityOf(plugin), this._entryForPlugin(plugin, 'system'))
            }
            this._commit(preserved, 'init-failed')
            this._incompatiblePlugins = new Map()
            this._init = true
            throw error
        }
    }

    /* ------------------------------------------------------------------ *
     * Entry construction
     * ------------------------------------------------------------------ */

    /** The registry entry for a plugin instance, with the given provenance. */
    private _entryForInstance(
        plugin: KPlugin<any>,
        source: PluginSource,
        descriptor?: RemotePluginDescriptor,
        sourceLabel?: string,
    ): ActivePlugin {
        const key = descriptor?.pluginKey || this._identityOf(plugin)
        return {
            key,
            plugin,
            meta: {
                key,
                name: plugin.name,
                pluginKey: descriptor?.pluginKey || plugin.pluginKey || key,
                version: descriptor?.version,
                source,
                desktopOnly: plugin.desktopOnly || descriptor?.desktopOnly === true,
                ...(sourceLabel ? { sourceLabel } : {}),
            },
        }
    }

    private _entryForPlugin(plugin: KPlugin<any>, source: PluginSource): ActivePlugin {
        const key = this._identityOf(plugin)
        return {
            key,
            plugin,
            meta: {
                key,
                name: plugin.name,
                pluginKey: plugin.pluginKey || key,
                source,
                desktopOnly: plugin.desktopOnly,
            },
        }
    }

    /**
     * Uninstall by registry key — or by name, for callers that only have one
     * (a published plugin calling `pluginHost.uninstall(name)`).
     *
     * Removing a plugin drops its render identities with it: installing it again
     * is a mount, not a reload, so its contributions start from fresh state. That
     * is now the *only* thing an uninstall does to identities — a bundle that
     * renames itself is no longer an uninstall + install, because the identity is
     * the registry key, which does not change when a name does.
     */
    uninstallPlugin(identifier: string): boolean {
        const key = this._keyFor(identifier)
        const clearedIncompatibility = this._clearPluginIncompatibility({
            pluginKey: key ? this._entries.get(key)?.meta.pluginKey : undefined,
            name: identifier,
        })
        if (!key) {
            if (!clearedIncompatibility) {
                logger.warn(`Plugin ${identifier} not found, cannot uninstall`)
                return false
            }
            this._notifyChange()
            return true
        }

        const next = new Map(this._entries)
        next.delete(key)
        // Invalidate the script cache so a re-install re-fetches the bundle
        // instead of serving the removed one from memory.
        this.clearPluginCache()
        this._commit(next, `uninstall:${key}`)
        this._forgetPluginCss(key)
        logger.info('Plugin uninstalled:', key)
        return true
    }

    /**
     * Install a plugin bundle that is already in hand (a dev build, or any
     * locally produced artifact).
     *
     * This is the studio's whole interaction with the registry, and the arrival
     * of the *new* registry design shows why: whether the bundle is a first
     * install, a hot reload, a rename, or a dev build shadowing a published
     * artifact is not a flag the caller passes — it is a question about the
     * registry, answered by the plan below. The caller says what it built; the
     * manager decides what that means.
     */
    async installBundle(bundle: PluginBundle, callBack?: () => void): Promise<PluginInstallOutcome> {
        const key = bundle.pluginKey || bundle.name
        const reject = (reason: string): PluginInstallOutcome => {
            logger.error(`installBundle(${bundle.name}): ${reason}`)
            return { ok: false, key, reason }
        }

        if (!bundle.code || !bundle.name) {
            return reject('code and name are required')
        }
        if (this._isInitialPluginKey(bundle.pluginKey)) {
            return reject(`"${bundle.pluginKey}" is provided by the host itself and cannot be installed from a bundle`)
        }

        /**
         * What the registry held *before* this load.
         *
         * A bundle that throws while it is being evaluated never calls
         * `definePlugin`, so the loader reads back this same, stale registration.
         * Treating it as a result would report the previous version as a
         * successful reload (or activate a plugin the bundle never produced).
         */
        const previousRegistration = previousPluginRegistration(bundle.pluginKey)
        const descriptor: RemotePluginDescriptor = {
            pluginKey: bundle.pluginKey,
            name: bundle.name,
            version: bundle.version,
            resourcePath: `inline://${bundle.sourceLabel ?? bundle.name}`,
        }

        /**
         * The entry this bundle is a new build *of*.
         *
         * Three ways to be the same plugin, in order of certainty:
         *
         * 1. the same registry key;
         * 2. the same project root — how a build finds its own entry after the
         *    manifest's `pluginKey` was edited;
         * 3. the same plugin under *another* name or key. This is not hypothetical:
         *    an artifact installed from a legacy marketplace record (no
         *    `pluginKey`) is filed under a key derived from its name, so
         *    `pluginKey: "apiclient"` in the manifest does not match its key
         *    `"API Client"` — and without this the build would look like a *second*
         *    plugin, which the plan then refuses as a duplicate. A new build of a
         *    plugin must **replace** the running copy, whatever it is filed under.
         */
        const target = this._entries.get(bundle.pluginKey)
            ?? (bundle.sourceLabel
                ? [...this._entries.values()].find(entry =>
                    entry.meta.source === 'dev' && entry.meta.sourceLabel === bundle.sourceLabel)
                : undefined)
            ?? this._entryFor(bundle.pluginKey)
            ?? this._entryFor(bundle.name)

        let objectUrl: string | undefined
        try {
            objectUrl = URL.createObjectURL(new Blob([bundle.code], { type: 'text/javascript' }))
            const registration = await pluginScriptLoader.load(
                objectUrl,
                bundle.pluginKey,
                bundle.name,
                { bustCache: true, timeout: this._loadTimeoutMs },
            )
            if (!registration) return reject('the loader returned no registration for this bundle')
            if (previousRegistration && registration === previousRegistration) {
                return reject(
                    'the bundle did not register itself: it threw while being evaluated '
                    + 'and the host namespace still holds the previous registration',
                )
            }
            const outcome = this._activate(descriptor, registration, {
                source: 'dev',
                sourceLabel: bundle.sourceLabel,
                css: bundle.css,
                replaceKey: target?.key,
            })
            if (outcome.ok) callBack?.()
            return outcome
        } catch (error) {
            return reject(
                `the bundle could not be loaded or evaluated: `
                + `${error instanceof Error ? error.message : String(error)}`,
            )
        } finally {
            // The registration is cached in memory; the URL itself is not needed.
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }

    /**
     * Install a plugin from JavaScript source held in memory.
     *
     * Back-compat wrapper over {@link installBundle} for the `pluginHost` /
     * `pluginManagement` services, which are a published contract. New callers
     * should take the typed outcome: a boolean cannot say *why* a bundle was
     * refused, which is the part a developer needs to see.
     */
    async installPluginFromSource(
        options: {
            code: string
            pluginKey: string
            name: string
            version?: string
            /** Hot reload: swap an active entry in place. Omit to install fresh. */
            replace?: boolean
            /** Label for logs; also how a dev build finds its own project. */
            sourceLabel?: string
            /** Compiled CSS, applied atomically with the code. */
            css?: string
            /** Why the install was refused, verbatim (legacy diagnostic channel). */
            onRejected?: (reason: string) => void
        },
        callBack?: () => void,
    ): Promise<boolean> {
        if (options.replace === false) {
            // The legacy contract: an explicit "install, do not touch what is
            // running". A bundle path with no `replace` intent still *installs*
            // when its key is new — this only preserves the old refusal.
            const active = this._keyFor(options.pluginKey) ?? this._keyFor(options.name)
            if (active) {
                const reason = `"${active}" is already active; uninstall it first or replace it`
                options.onRejected?.(reason)
                logger.error(`installPluginFromSource(${options.name}): ${reason}`)
                return false
            }
        }

        const outcome = await this.installBundle({
            code: options.code,
            pluginKey: options.pluginKey,
            name: options.name,
            version: options.version,
            sourceLabel: options.sourceLabel,
            css: options.css,
        }, callBack)
        // `=== false`, not `!outcome.ok`: the check compiles run without
        // `strictNullChecks`, and a falsy test does not narrow a
        // boolean-discriminated union there.
        if (outcome.ok === false) options.onRejected?.(outcome.reason)
        return outcome.ok
    }

    /**
     * Install a remote artifact (an entry from the server's installed list).
     *
     * Refused when its registry key is already active: the server's list is the
     * authority for `installed` plugins, so a *reload* only happens through a
     * re-init or through a bundle. A dev build that shadows the same key keeps
     * winning, which is what `_runtimeLocalEntries` carries across a re-init.
     */
    async installPlugin(input: RemotePluginInput, callBack?: () => void) {
        const descriptor = normalizeRemotePluginDescriptor(input)
        if (!descriptor) {
            logger.error(`Plugin ${getRemotePluginInputName(input)} is missing required runtime metadata`)
            return false
        }
        if (this._isInitialPluginKey(descriptor.pluginKey)) {
            logger.warn(`Plugin ${descriptor.pluginKey} is provided by the host and cannot be installed remotely`)
            return false
        }

        try {
            const path = this._buildPluginUrl(descriptor)
            const registration = await pluginScriptLoader.load(path, descriptor.pluginKey, descriptor.name, {
                bustCache: true,
                integrity: descriptor.integrity || undefined,
                timeout: this._loadTimeoutMs,
            })
            if (!registration) {
                logger.error(`Failed to load plugin instance for ${descriptor.name}`)
                return false
            }
            const outcome = this._activate(descriptor, registration, { source: 'installed' })
            if (outcome.ok) callBack?.()
            return outcome.ok
        } catch (error) {
            logger.error(`Error installing plugin ${descriptor?.name}:`, error)
            return false
        }
    }

    /*
     * The activation pipeline, shared by every install path: version handshake,
     * `KPlugin` extraction, component-identity wrapping, plan, commit.
     *
     * Nothing here mutates the registry except through `_commit`, and the plan is
     * checked *before* the commit, so a `false`/`ok:false` result always means
     * "nothing changed" — the previous version is still running, with its services
     * and its CSS intact.
     */
    private _activate(
        descriptor: RemotePluginDescriptor,
        registration: PluginRegistration,
        options: {
            source: PluginSource
            /** Key of the entry this activation replaces (a reload/shadow). */
            replaceKey?: string
            sourceLabel?: string
            css?: string
        },
    ): PluginInstallOutcome {
        const key = descriptor.pluginKey || descriptor.name
        const reject = (reason: string): PluginInstallOutcome => {
            logger.error(`Cannot activate ${descriptor.name}: ${reason}`)
            return { ok: false, key, reason }
        }

        const incompatibility = this._getApiIncompatibility(registration.meta, descriptor)
        if (incompatibility) {
            // Clearing the running plugin's incompatibility bookkeeping would be a
            // side effect of a *rejected* reload, so it only happens when there is
            // no entry being replaced.
            if (!options.replaceKey) this._clearPluginIncompatibility(descriptor)
            this._incompatiblePlugins.set(this._pluginIdentity(descriptor), incompatibility)
            this._notifyChange()
            return reject(
                `it was built for plugin API ${incompatibility.apiVersion}, `
                + `this host implements ${incompatibility.hostApiVersion}`,
            )
        }

        const instance = this._extractPlugin(registration)
        if (!instance) {
            return reject('the bundle exports no KPlugin instance (check the entry file\'s exports)')
        }
        if (!this._validatePlugin(instance)) {
            return reject('the bundle exports a plugin without a name')
        }

        const existing = options.replaceKey ? this._entries.get(options.replaceKey) : undefined
        if (!existing && this._entries.has(key)) {
            const active = this._entries.get(key)!
            return reject(
                `"${key}" is already active as "${active.meta.name}" `
                + `(source: ${active.meta.source}); uninstall it first or install a new build of it`,
            )
        }
        if (!existing && options.source === 'installed') {
            // The mirror of the init rule (see `_planEntries`): a published artifact
            // must not start running next to any other build of the same plugin,
            // dev or otherwise. The plan refuses it a step from here; this is the
            // message that says what to do about it.
            const shadowing = [...this._entries.values()].find(entry =>
                normalizePluginName(entry.meta.name) === normalizePluginName(instance.name))
            if (shadowing) {
                return reject(
                    `a plugin named "${instance.name}" is already active under pluginKey `
                    + `"${shadowing.key}" (source: ${shadowing.meta.source}); stop or uninstall it first`,
                )
            }
        }

        // Component identity is adopted *here*, once, for every contribution
        // point — not at each resolve site (see `KPlugin.mapComponents`).
        instance.mapComponents((kind, id, component) =>
            this._hotComponents.resolve(key, `${kind}:${id}`, component))

        const entry = this._entryForInstance(instance, options.source, descriptor, options.sourceLabel)
        const next = new Map(this._entries)
        if (existing && existing.key !== key) next.delete(existing.key)
        next.set(key, entry)

        const { conflicts } = this._planEntries(next)
        const own = conflicts.find(conflict => conflict.key === key)
        if (own) return reject(own.reason)

        const result = this._commit(next, existing ? `reload:${key}` : `install:${key}`)
        if (options.css !== undefined) this._applyPluginCss(key, options.css)
        if (!result.changed && existing) {
            // Same instances, same set: nothing to tell anyone about.
            logger.debug(`Plugin ${key} re-committed without a change`)
        }
        logger.info(
            existing
                ? `Plugin ${instance.name} hot-swapped successfully (${descriptor.version ?? 'dev'})`
                : `Plugin ${instance.name} installed successfully`,
        )
        return {
            ok: true,
            mode: existing ? 'reloaded' : 'installed',
            key,
            name: instance.name,
            version: descriptor.version,
            ...(existing && existing.meta.source !== 'dev' ? { shadowed: true } : {}),
        }
    }

    /**
     * Apply a bundle's compiled CSS to the host document.
     *
     * Bundles carry their own CSS (a published UMD must be self-contained), so
     * this is the *same* stylesheet written to the same per-plugin `<style>` tag.
     * Doing it at commit time is what makes it part of the transaction: a rejected
     * reload restores the previous stylesheet instead of leaving the developer's
     * panel styled by code that never ran.
     */
    private _applyPluginCss(key: string, css: string): void {
        this._committedCss.set(key, css)
        if (typeof document === 'undefined') return
        try {
            const selector = `style[data-kn-plugin-style="${key}"]`
            let tag = document.querySelector(selector) as HTMLStyleElement | null
            if (!tag) {
                tag = document.createElement('style')
                tag.setAttribute('data-kn-plugin-style', key)
                ;(document.head || document.documentElement).appendChild(tag)
            }
            tag.textContent = css
        } catch (error) {
            logger.warn(`Plugin ${key}: could not apply its stylesheet`, error)
        }
    }

    /** Put back the last stylesheet this plugin committed, if any. */
    private _restorePluginCss(key: string): void {
        const css = this._committedCss.get(key)
        if (css === undefined) this._forgetPluginCss(key)
        else this._applyPluginCss(key, css)
    }

    private _forgetPluginCss(key: string): void {
        this._committedCss.delete(key)
        if (typeof document === 'undefined') return
        try {
            const tag = document.querySelector(`style[data-kn-plugin-style="${key}"]`)
            tag?.parentNode?.removeChild(tag)
        } catch {
            /* best effort */
        }
    }

    /** Alias of {@link uninstallPlugin}: removing *is* uninstalling. */
    remove(identifier: string): boolean {
        return this.uninstallPlugin(identifier)
    }

    /** The active instance for a registry key or a runtime name. */
    getPlugin(identifier: string): KPlugin<any> | undefined {
        return this._entryFor(identifier)?.plugin
    }

    hasPlugin(identifier: string): boolean {
        return this._keyFor(identifier) !== undefined
    }

    /** Display names of the active plugins, in render order. */
    getAllPluginNames(): string[] {
        return [...this._entries.values()].map(entry => entry.meta.name)
    }

    /**
     * Active plugins with their install metadata. Backs the `pluginManagement`
     * core service so management UIs (and the plugin studio) do not need to
     * reach into the manager.
     *
     * `pluginKey` is the identity here; `name` is what a human sees. Callers that
     * need to address a plugin (reload it, check whether it is running) must use
     * the key — a name can differ between builds of one plugin.
     */
    getPluginEntries(): PluginManagementEntry[] {
        return [...this._entries.values()].map(entry => ({
            name: entry.meta.name,
            pluginKey: entry.meta.pluginKey,
            version: entry.meta.version,
            source: entry.meta.source,
            desktopOnly: entry.meta.desktopOnly,
        }))
    }

    /** Resolve an entry by registry key, or by the name it is running under. */
    getPluginEntry(identifier: string): PluginManagementEntry | undefined {
        const key = this._keyFor(identifier)
        if (!key) return undefined
        const meta = this._entries.get(key)!.meta
        return {
            name: meta.name,
            pluginKey: meta.pluginKey,
            version: meta.version,
            source: meta.source,
            desktopOnly: meta.desktopOnly,
        }
    }

    /** Host-owned (system) plugins are part of the app and cannot be removed. */
    isPluginRemovable(identifier: string): boolean {
        const entry = this._entryFor(identifier)
        return Boolean(entry) && entry!.meta.source !== 'system'
    }

    get initStatus() {
        return this._init
    }

    // ---- Resolve methods (correctly spelled) ----

    /**
     * Every plugin route, in plugin order.
     *
     * Validated and de-duplicated by path (first wins), like the other resolve
     * methods: a route without a usable `path`, or a second route claiming a path
     * another plugin already registered, is dropped with a warning instead of being
     * handed to the router — where a duplicate would silently shadow the first and
     * a malformed path would break navigation for that plugin alone.
     *
     * The *host* renders these live (see `usePluginRoutes`), so a route exists as
     * soon as its plugin does, and a hot reload can change a route's code without
     * rebuilding the router.
     */
    resolveRoutes(): RouteConfig[] {
        if (this._cacheRoutes) {
            return this._cacheRoutes
        }

        const routes: RouteConfig[] = []
        const seen = new Set<string>()
        const collect = (configs: RouteConfig[] | undefined, owner: string): void => {
            for (const config of configs ?? []) {
                if (!config || typeof config.path !== 'string' || !config.path.trim()) {
                    logger.warn(`Invalid route from ${owner}, skipping`)
                    continue
                }
                if (seen.has(config.path)) {
                    logger.warn(`Route ${config.path} already registered, skipping duplicate from ${owner}`)
                    continue
                }
                seen.add(config.path)
                routes.push({
                    ...config,
                    children: config.children?.length
                        ? (() => {
                            // Children are part of the same route entry: validate and
                            // keep them, but remember their paths so a later plugin
                            // cannot register the same child path twice either.
                            const children: RouteConfig[] = []
                            for (const child of config.children ?? []) {
                                if (!child || typeof child.path !== 'string' || !child.path.trim()) {
                                    logger.warn(`Invalid child route of ${config.path}, skipping`)
                                    continue
                                }
                                if (seen.has(child.path)) {
                                    logger.warn(`Route ${child.path} already registered, skipping duplicate`)
                                    continue
                                }
                                seen.add(child.path)
                                children.push(child)
                            }
                            return children
                        })()
                        : undefined,
                })
            }
        }

        for (const plugin of this.plugins) {
            collect(plugin.routes, plugin.name)
        }

        this._cacheRoutes = routes
        return routes
    }

    // ---- Kernel agent capabilities (M0) ----
    // Plugins grow the agent through top-level `PluginConfig.tools` / `.skills`
    // (plus `PluginConfig.agent` for includes, context, actions and renderers —
    // see ai/plugin-agent/types.ts). Legacy `editorExtension[].tools/skills` were
    // retired and are only reported.

    /**
     * Build the context handed to plugin agent tools. Scope is derived from
     * whether an editor is published: a run with an editor is page-scoped,
     * otherwise workspace-scoped. Editor-free tools simply ignore `editor`.
     */
    private buildAgentToolContext(editor: Editor | null, scope: ResolvedAgentScope): AgentToolContext {
        return {
            scope,
            editor: editor ?? undefined,
            resolveService: (name: string) => this._serviceRegistryView.get(name as keyof Services),
        }
    }

    private agentPluginKey(plugin: KPlugin<any>): string {
        return this._keyOf(plugin)
    }

    /**
     * The model-facing name of one plugin tool: its bare local name.
     *
     * Tools used to be namespaced (`{pluginKey}__{name}`); that is gone because
     * it made a plugin's tools reachable only through a prefix nobody ever wrote
     * — not the plugin author, not the system prompt, not the model. A local-name
     * collision between two plugins is resolved by last-registration-wins with a
     * warning (see the instantiation below).
     */
    private agentWireNameFor(pluginKey: string, tool: AgentToolDefinition): string {
        if (tool.namespace === false) {
            logger.warn(
                `Tool "${tool.name}" declares the retired \`namespace: false\` option `
                + `(plugin ${pluginKey}); namespacing no longer exists, the option is ignored.`,
            )
        }
        return toAgentWireName(pluginKey, tool.name)
    }

    /**
     * Per-plugin agent contributions with provenance.
     *
     * Reads the plugin's TOP-LEVEL `tools` / `skills` — declared next to its
     * menus and routes — plus whatever else lives under `agent` (`include`,
     * context, actions, renderers). `agent.tools` / `agent.skills` still work so
     * already-published plugins keep loading, but the nesting is reported: tools
     * and skills are the plugin's agent surface, not a sub-object of it.
     *
     * Editor-extension tools/skills are not aggregated at all: that flat path is
     * what let a plugin's tools, skills and scope drift apart (§32/§33).
     */
    resolveAgentContributions(): ResolvedAgentContribution[] {
        if (this._cacheAgentContributions) {
            return this._cacheAgentContributions
        }

        const resolved: ResolvedAgentContribution[] = []
        for (const plugin of this.plugins) {
            for (const ext of plugin.editorExtensions) {
                if ((ext.tools && ext.tools.length > 0) || (ext.skills && ext.skills.length > 0)) {
                    logger.warn(
                        `Plugin "${plugin.name}" still declares AI tools/skills on its editor `
                        + `extension "${ext.name}". That path was retired: move them onto the `
                        + 'plugin itself as top-level `tools` / `skills` '
                        + '(see liftLegacyTools / liftLegacySkills).',
                    )
                }
            }

            const agent = plugin.agent ?? {}
            if ((agent.tools?.length ?? 0) > 0 || (agent.skills?.length ?? 0) > 0) {
                logger.warn(
                    `Plugin "${plugin.name}" declares tools/skills inside \`agent\`. That nesting is `
                    + 'deprecated: declare `tools` and `skills` at the top level of the plugin config. '
                    + 'The nested form still works, so published plugins keep loading.',
                )
            }
            // Deprecated nesting first, top-level last: on a name collision the
            // plugin's current declaration wins.
            const tools = [...(agent.tools ?? []), ...plugin.tools]
            const skills = [...(agent.skills ?? []), ...plugin.skills]

            resolved.push({
                pluginName: plugin.name,
                pluginKey: this.agentPluginKey(plugin),
                desktopOnly: plugin.desktopOnly,
                contribution: {
                    ...agent,
                    ...(tools.length > 0 ? { tools } : {}),
                    ...(skills.length > 0 ? { skills } : {}),
                },
            })
        }

        this._cacheAgentContributions = resolved
        return resolved
    }

    /**
     * Flatten every plugin contribution into model-facing capability sets:
     * tool names are namespaced and `include` references are resolved against
     * the core implementation registry. With `runScope`, only declarations
     * covering that scope are returned — page tools never reach a workspace run.
     */
    resolveAgentCapabilities(runScope?: ResolvedAgentScope): ResolvedAgentCapabilities {
        const capabilities: ResolvedAgentCapabilities = {
            tools: [], skills: [], context: [], actions: [],
            toolRenderers: [], artifactRenderers: [],
        }

        for (const entry of this.resolveAgentContributions()) {
            const projected = runScope
                ? filterContributionByScope(entry.contribution, runScope)
                : entry.contribution
            const localToWire = new Map<string, string>()

            const pushTool = (
                def: AgentToolDefinition,
                scope: AgentScope | AgentScope[] | undefined,
                wireName: string,
            ) => {
                capabilities.tools.push({
                    ...def,
                    scope,
                    wireName,
                    pluginName: entry.pluginName,
                    pluginKey: entry.pluginKey,
                    desktopOnly: entry.desktopOnly,
                })
            }

            for (const tool of projected.tools ?? []) {
                if (!tool || !tool.name) {
                    logger.warn('Invalid agent tool detected, skipping')
                    continue
                }
                if (runScope && !agentScopeMatches(tool.scope, runScope)) continue
                const wireName = this.agentWireNameFor(entry.pluginKey, tool)
                localToWire.set(tool.name, wireName)
                pushTool(tool, tool.scope, wireName)
            }

            for (const raw of projected.include ?? []) {
                const ref = typeof raw === 'string' ? { name: raw } : raw
                const impl = getAgentToolImplementation(ref.name)
                if (!impl) {
                    logger.warn(`Agent tool include "${ref.name}" is not registered by the host`)
                    continue
                }
                const scope = ref.scope ?? impl.scope
                if (runScope && !agentScopeMatches(scope, runScope)) continue
                const wireName = toAgentWireName(entry.pluginKey, impl.name)
                localToWire.set(impl.name, wireName)
                pushTool(
                    {
                        name: impl.name,
                        description: impl.description,
                        inputSchema: impl.inputSchema,
                        readOnly: impl.readOnly,
                        scope,
                        artifactFromResult: impl.artifactFromResult,
                        create: impl.create,
                    },
                    scope,
                    wireName,
                )
            }

            const mapNames = (names?: string[]): string[] | undefined =>
                resolveAgentToolNames(names, localToWire)

            for (const skill of projected.skills ?? []) {
                if (!skill || !skill.name) continue
                capabilities.skills.push({
                    ...skill,
                    requiredTools: mapNames(skill.requiredTools) ?? [],
                    optionalTools: mapNames(skill.optionalTools),
                    source: 'plugin',
                    pluginName: entry.pluginName,
                    pluginKey: entry.pluginKey,
                })
            }
            for (const provider of projected.context ?? []) {
                if (runScope && !agentScopeMatches(provider.scope, runScope)) continue
                // Context providers read user data, so declaring one is not
                // enough: the hosting app must authorize its id (see
                // ai/plugin-agent/context-whitelist.ts). Deny by default —
                // dropping here means no surface can even observe it.
                if (!isAgentContextAllowed(provider.id)) {
                    logger.warn(
                        `Plugin "${entry.pluginName}" declares context provider "${provider.id}" `
                        + 'but the host did not authorize it; ignoring',
                    )
                    continue
                }
                capabilities.context.push({ ...provider, pluginName: entry.pluginName, pluginKey: entry.pluginKey })
            }
            for (const action of projected.actions ?? []) {
                if (runScope && !agentScopeMatches(action.scope, runScope)) continue
                capabilities.actions.push({
                    ...action, tools: mapNames(action.tools),
                    pluginName: entry.pluginName, pluginKey: entry.pluginKey,
                })
            }
            // Conversation cards / sheet previews. The tool key is resolved
            // through the same local→wire table as skills, so a plugin can name
            // its own tools by their local name.
            for (const renderer of projected.toolRenderers ?? []) {
                if (!renderer || !renderer.tool || !renderer.render) continue
                capabilities.toolRenderers.push({
                    ...renderer,
                    tool: localToWire.get(renderer.tool) ?? renderer.tool,
                    pluginName: entry.pluginName,
                    pluginKey: entry.pluginKey,
                })
            }
            for (const renderer of projected.artifactRenderers ?? []) {
                if (!renderer || !renderer.kind || !renderer.render) continue
                capabilities.artifactRenderers.push({
                    kind: renderer.kind,
                    render: renderer.render,
                    pluginName: entry.pluginName,
                    pluginKey: entry.pluginKey,
                })
            }
        }

        return capabilities
    }

    /**
     * Instantiate every plugin's agent tools for `editor`, grouped by plugin.
     * The single resolution path shared by {@link resolveTools} and the
     * capability provider, so a tool can never be advertised in one place and
     * missing in the other.
     */
    resolvePluginToolGroups(editor: Editor | null): ResolvedPluginToolGroup[] {
        const scope: ResolvedAgentScope = editor ? 'page' : 'workspace'
        const ctx = this.buildAgentToolContext(editor, scope)
        const groups: ResolvedPluginToolGroup[] = []

        for (const entry of this.resolveAgentContributions()) {
            const projected = filterContributionByScope(entry.contribution, scope)
            const record: Record<string, any> = {}

            const instantiate = (
                wireName: string,
                create: (ctx: AgentToolContext) => unknown,
                def: { description: string; inputSchema: any; readOnly?: boolean; priority?: number },
            ) => {
                try {
                    const execute = create(ctx)
                    if (typeof execute !== 'function') return
                    if (record[wireName]) logger.warn(`Tool ${wireName} already exists, overwriting`)
                    record[wireName] = {
                        description: def.description,
                        inputSchema: def.inputSchema,
                        readOnly: def.readOnly,
                        // Ranks this tool against the provider's tool ceiling; see
                        // ToolProvider#registerPluginTools.
                        priority: def.priority,
                        execute,
                    }
                } catch (error) {
                    // A factory that needs a live editor must not take the whole
                    // catalog down with it: skip that tool and keep the rest.
                    logger.warn(`Tool ${wireName} could not be instantiated`, error)
                }
            }

            for (const tool of projected.tools ?? []) {
                if (!tool || !tool.name) continue
                instantiate(this.agentWireNameFor(entry.pluginKey, tool), tool.create, tool)
            }

            for (const raw of projected.include ?? []) {
                const ref = typeof raw === 'string' ? { name: raw } : raw
                const impl = getAgentToolImplementation(ref.name)
                if (!impl) {
                    logger.warn(`Agent tool include "${ref.name}" is not registered by the host`)
                    continue
                }
                if (!agentScopeMatches(ref.scope ?? impl.scope, scope)) continue
                instantiate(toAgentWireName(entry.pluginKey, impl.name), impl.create, impl)
            }

            if (Object.keys(record).length > 0) {
                groups.push({ pluginName: entry.pluginName, tools: record })
            }
        }

        return groups
    }

    resolveLocales(): any {
        if (this._cacheLocales) {
            return this._cacheLocales
        }

        let locales: any = {}
        for (const plugin of this.plugins) {
            if (plugin.locales) {
                locales = merge(locales, plugin.locales)
            }
        }

        this._cacheLocales = locales
        return locales
    }

    resolveEditorExtensions(): ExtensionWrapper[] {
        if (this._cacheExtensions) {
            return this._cacheExtensions
        }

        const editorExtensions: ExtensionWrapper[] = []
        for (const plugin of this.plugins) {
            if (plugin.editorExtensions && plugin.editorExtensions.length > 0) {
                editorExtensions.push(...plugin.editorExtensions)
            }
        }

        this._cacheExtensions = editorExtensions
        return editorExtensions
    }

    resolveMenus(): SiderMenuItemProps[] {
        if (this._cacheMenus) {
            return this._cacheMenus
        }

        const menus: SiderMenuItemProps[] = []
        for (const plugin of this.plugins) {
            if (plugin.menus && plugin.menus.length > 0) {
                menus.push(...plugin.menus)
            }
        }

        this._cacheMenus = menus
        return menus
    }

    /**
     * Resolve all plugin settings configurations
     * Returns an array of settings configs with plugin metadata
     */
    resolvePluginSettings(): Array<PluginSettingsConfig & { pluginName: string }> {
        const settings: Array<PluginSettingsConfig & { pluginName: string }> = []
        for (const plugin of this.plugins) {
            if (plugin.settings) {
                settings.push({ ...plugin.settings, pluginName: plugin.name })
            }
        }
        return settings
    }

    /**
     * Resolve all tours contributed by plugins.
     * De-duplicates by tour id (first occurrence wins).
     */
    resolveTours(): TourConfig[] {
        if (this._cacheTours) {
            return this._cacheTours
        }

        const tours: TourConfig[] = []
        const seen = new Set<string>()
        for (const plugin of this.plugins) {
            for (const tour of plugin.tours) {
                if (!tour || !tour.id) {
                    logger.warn('Invalid tour detected, skipping')
                    continue
                }
                if (seen.has(tour.id)) {
                    logger.warn(`Tour ${tour.id} already registered, skipping duplicate`)
                    continue
                }
                seen.add(tour.id)
                tours.push(tour)
            }
        }

        this._cacheTours = tours
        return tours
    }

    /**
     * Register a built-in dock panel contributed by the host.
     * Mirrors registerCoreService: same contract as plugin panels, but the host
     * owns the lifecycle. Re-registering the same id replaces the panel.
     */
    registerCoreDockPanel(panel: DockPanelConfig): void {
        if (!panel?.id) {
            logger.warn('Core dock panel must have an id, skipping')
            return
        }
        this._coreDockPanels.set(panel.id, panel)
        logger.debug(`Core dock panel registered: ${panel.id}`)
        this._notifyChange()
    }

    /**
     * Remove a previously registered built-in dock panel.
     */
    unregisterCoreDockPanel(id: string): void {
        if (!this._coreDockPanels.delete(id)) return
        logger.debug(`Core dock panel unregistered: ${id}`)
        this._notifyChange()
    }

    /**
     * Resolve all dock panels (host built-ins first, then plugin contributions),
     * de-duplicated by id and sorted by `order` ascending.
     *
     * @param position Only return panels for this dock. Omit for all positions.
     */
    resolveDockPanels(position?: DockPosition): ResolvedDockPanel[] {
        if (!this._cacheDockPanels) {
            const panels: ResolvedDockPanel[] = []
            const seen = new Set<string>()

            const collect = (
                panel: DockPanelConfig,
                source: 'plugin' | 'core',
                owner: string,
                pluginKey: string,
            ) => {
                if (!panel || !panel.id || !panel.component) {
                    logger.warn(`Invalid dock panel from ${owner}, skipping`)
                    return
                }
                if (seen.has(panel.id)) {
                    logger.warn(`Dock panel ${panel.id} already registered, skipping duplicate from ${owner}`)
                    return
                }
                seen.add(panel.id)
                // `panel.component` already carries its stable identity: the
                // wrapper is adopted once, at activation (KPlugin.mapComponents),
                // so this stays a pure projection and every contribution point
                // gets the same treatment without this method knowing about it.
                panels.push({ ...panel, source, owner, pluginKey })
            }

            this._coreDockPanels.forEach(panel => collect(panel, 'core', 'core', 'core'))
            for (const plugin of this.plugins) {
                // The runtime name is what the host renders under; the registry
                // key is what the plugin's injected CSS is scoped to.
                const pluginKey = this._keyOf(plugin)
                for (const panel of plugin.dockPanels) {
                    collect(panel, 'plugin', plugin.name, pluginKey)
                }
            }

            panels.sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
            this._cacheDockPanels = panels
        }

        if (!position) return this._cacheDockPanels
        return this._cacheDockPanels.filter(p => (p.position ?? 'right') === position)
    }

    /**
     * Resolve all page types contributed by active plugins. Contributions must
     * use a namespaced id (`namespace:name`); malformed entries and later
     * duplicates are skipped. Equal-order entries retain contribution order.
     */
    resolvePageTypes(): ResolvedPageType[] {
        if (!this._cachePageTypes) {
            const pageTypes: Array<{ value: ResolvedPageType; index: number }> = []
            const seen = new Set<string>()
            let index = 0

            const isNamespacedId = (id: unknown): id is string =>
                typeof id === 'string' && /^[^\s:]+:[^\s:]+$/.test(id)
            const isValidRenderer = (renderer: unknown): renderer is PageTypeConfig['renderer'] => {
                if (!renderer || typeof renderer !== 'object') return false
                const candidate = renderer as Record<string, unknown>
                if (candidate.type === 'component') return typeof candidate.component === 'function'
                if (candidate.type === 'editor-component') return typeof candidate.createInitialDocument === 'function'
                return false
            }

            for (const plugin of this.plugins) {
                for (const pageType of plugin.pageTypes) {
                    if (!pageType
                        || !isNamespacedId(pageType.id)
                        || typeof pageType.label !== 'string'
                        || !pageType.label.trim()
                        || !isValidRenderer(pageType.renderer)) {
                        logger.warn(`Invalid page type from ${plugin.name}, skipping`)
                        continue
                    }
                    if (seen.has(pageType.id)) {
                        logger.warn(`Page type ${pageType.id} already registered, skipping duplicate from ${plugin.name}`)
                        continue
                    }
                    seen.add(pageType.id)
                    const pluginKey = this._keyOf(plugin)
                    pageTypes.push({
                        value: { ...pageType, source: 'plugin', owner: plugin.name },
                        index: index++,
                    })
                }
            }

            pageTypes.sort((a, b) => {
                const aOrder = Number.isFinite(a.value.order) ? a.value.order! : 100
                const bOrder = Number.isFinite(b.value.order) ? b.value.order! : 100
                return aOrder - bOrder || a.index - b.index
            })
            this._cachePageTypes = pageTypes.map(({ value }) => value)
        }

        return this._cachePageTypes
    }

    /** Resolve one page type by its stable namespaced id. */
    resolvePageType(id: string): ResolvedPageType | undefined {
        return this.resolvePageTypes().find(pageType => pageType.id === id)
    }

    /**
     * Plugin skills for the frontend skill provider: the contribution-level
     * `agent.skills` (tool names already resolved to wire names), plus an
     * auto-generated default skill for every plugin tool no skill claims — in a
     * skills-only catalog that default is the tool's only route to the backend.
     */
    resolveSkills(): ResolvedAgentSkill[] {
        const capabilities = this.resolveAgentCapabilities()
        const skills: ResolvedAgentSkill[] = [...capabilities.skills]

        const claimed = new Set<string>()
        for (const skill of capabilities.skills) {
            for (const name of [...(skill.requiredTools ?? []), ...(skill.optionalTools ?? [])]) {
                claimed.add(name)
            }
        }
        const unclaimedByPlugin = new Map<string, string[]>()
        for (const tool of capabilities.tools) {
            if (claimed.has(tool.wireName)) continue
            const list = unclaimedByPlugin.get(tool.pluginName) ?? []
            list.push(tool.wireName)
            unclaimedByPlugin.set(tool.pluginName, list)
        }
        for (const [pluginName, toolNames] of unclaimedByPlugin) {
            if (toolNames.length === 0) continue
            skills.push({
                name: `${pluginName}-default`,
                description: `Default skill for ${pluginName} plugin`,
                requiredTools: toolNames,
                source: 'plugin',
                pluginName,
                pluginKey: pluginName,
            })
        }

        logger.debug('Total resolved skills:', skills.length)
        return skills
    }

    /**
     * Load external plugins and extract their editor extensions.
     * This method is used for collaboration scenarios where we need to load
     * another user's plugins without affecting the current user's plugin list.
     *
     * @param plugins Array of plugin metadata with resourcePath and pluginKey
     * @returns Array of ExtensionWrapper from the loaded plugins
     */
    async loadExternalPluginExtensions(inputs: readonly RemotePluginInput[]): Promise<ExtensionWrapper[]> {
        const extensions: ExtensionWrapper[] = [];

        if (!inputs || inputs.length === 0) {
            return extensions;
        }

        const plugins = inputs.flatMap(input => {
            const plugin = normalizeRemotePluginDescriptor(input)
            if (plugin) return [plugin]
            logger.warn(`Skipping external plugin ${getRemotePluginInputName(input)}: missing required runtime metadata`)
            return []
        })

        const loadResults = await Promise.allSettled(plugins.map(async (plugin) => {
            try {
                // Construct the plugin URL (same logic as init)
                const pluginUrl = plugin.resourcePath.startsWith('http')
                    ? plugin.resourcePath
                    : this._buildPluginUrl(plugin);

                // Load the plugin script
                const registration = await pluginScriptLoader.load(
                    pluginUrl,
                    plugin.pluginKey,
                    plugin.name,
                    { integrity: plugin.integrity, timeout: this._loadTimeoutMs },
                );

                // Version handshake before extracting the KPlugin instance
                if (this._getApiIncompatibility(registration.meta, plugin)) {
                    return null;
                }

                const pluginInstance = this._extractPlugin(registration);

                return pluginInstance;
            } catch (error) {
                logger.warn(`Failed to load external plugin ${plugin.name}:`, error);
                return null;
            }
        }));

        // Extract extensions from successfully loaded plugins
        for (const result of loadResults) {
            if (result.status === 'fulfilled' && result.value) {
                const pluginInstance = result.value;
                if (pluginInstance.editorExtensions && pluginInstance.editorExtensions.length > 0) {
                    extensions.push(...pluginInstance.editorExtensions);
                }
            }
        }

        logger.info(`Loaded ${extensions.length} external extensions from ${plugins.length} plugins`);
        return extensions;
    }

    /** Read-only service access for hooks and plugin consumers. */
    get serviceRegistry(): ServiceRegistryView {
        return this._serviceRegistryView
    }

    /**
     * Register a host-owned core service after construction.
     *
     * Needed when a service's implementation closes over the manager itself
     * (e.g. `pluginHost`), which is impossible to express in the constructor's
     * `coreServices` object. Core services cannot be replaced by plugins.
     */
    registerCoreService<K extends keyof Services>(name: K, service: NonNullable<Services[K]>): void {
        this._serviceRegistry.register(name, service, CORE_SERVICE_OWNER)
    }

    /**
     * @deprecated Use serviceRegistry.getAll() instead
     */
    get pluginServices(): Services {
        return this._serviceRegistry.getAll()
    }

}
