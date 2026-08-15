/**
 * Global namespace consolidation for the plugin system.
 *
 * Instead of scattering shared libraries directly on `window` (ui, common,
 * core, icon, editor, React, ReactDOM), the host exposes a single frozen
 * `window.__KN__` namespace that new plugin bundles resolve their externals
 * from and register themselves into (via `definePlugin`).
 *
 * NOTE: these types intentionally mirror `@kn/plugin-api` — @kn/common must
 * NOT depend on @kn/plugin-api (dependency direction is plugin-api -> common),
 * so the shapes are declared structurally here.
 */

/** Build-time metadata registered by a plugin bundle. */
export interface PluginMeta {
    /** The @kn/plugin-api version the plugin was built against. */
    apiVersion?: string
    /** The plugin's package name (UMD bundle name). */
    packageName?: string
}

/** A loaded plugin bundle: its UMD exports plus build metadata. */
export interface PluginRegistration {
    exports: Record<string, unknown>
    meta: PluginMeta
}

/** The shape of the frozen `window.__KN__` namespace. */
export interface KnGlobalNamespace {
    React: any
    ReactDOM: any
    ui: any
    common: any
    core: any
    icon: any
    editor: any
    /** The plugin API version the running host was built with. */
    hostApiVersion: string
    /**
     * Host build-time env (Vite import.meta.env), published so plugin UMD
     * bundles — which cannot see import.meta.env themselves — can read
     * VITE_* variables at runtime via {@code getAppEnv}.
     */
    env?: Record<string, string | boolean | undefined>
    /** Called by plugin bundles (rollup outro) to register their exports. */
    definePlugin: (packageName: string, exports: Record<string, unknown>, meta?: PluginMeta) => void
    /** Retrieve a previously registered plugin bundle. */
    getPlugin: (packageName: string) => PluginRegistration | undefined
}

export interface SetupGlobalNamespaceOptions {
    React: any
    ReactDOM: any
    ui: any
    common: any
    core: any
    icon: any
    editor: any
    hostApiVersion: string
    /** Host build-time env published to plugins (see KnGlobalNamespace.env). */
    env?: Record<string, string | boolean | undefined>
}

/**
 * Build and install `window.__KN__`, plus the legacy per-library globals.
 *
 * The top-level namespace is frozen so plugins cannot tamper with the shared
 * libraries or the registration functions; the internal registry Map stays
 * mutable through `definePlugin`.
 */
export function setupGlobalNamespace(opts: SetupGlobalNamespaceOptions): KnGlobalNamespace {
    const registry = new Map<string, PluginRegistration>()

    const kn: KnGlobalNamespace = {
        React: opts.React,
        ReactDOM: opts.ReactDOM,
        ui: opts.ui,
        common: opts.common,
        core: opts.core,
        icon: opts.icon,
        editor: opts.editor,
        hostApiVersion: opts.hostApiVersion,
        env: opts.env ?? {},
        definePlugin: (packageName, exports, meta) => {
            registry.set(packageName, { exports, meta: meta ?? {} })
        },
        getPlugin: (packageName) => registry.get(packageName),
    }

    Object.freeze(kn)
    ;(window as any).__KN__ = kn

    // Legacy compatibility layer: plugin bundles built before the __KN__
    // namespace resolve their externals via `global.ui`, `global.common`, etc.
    // These assignments MUST be kept until all published plugins are rebuilt.
    window.ui = opts.ui
    window.common = opts.common
    window.core = opts.core
    window.icon = opts.icon
    window.editor = opts.editor
    ;(window as any).React = opts.React
    ;(window as any).ReactDOM = opts.ReactDOM

    return kn
}
