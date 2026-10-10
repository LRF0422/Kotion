/**
 * The bundle contract between a producer (the plugin studio's bundler) and the
 * registry that activates it.
 *
 * Lives in its own module because both sides own it: the manager installs it, the
 * core services pass it through, and the studio builds it. Keeping it out of
 * `PluginManager` is what lets the service contracts describe a bundle without
 * importing the registry.
 */

/** An in-memory plugin bundle: a dev build, or any locally produced artifact. */
export interface PluginBundle {
    /** JavaScript produced by the bundler. */
    code: string
    /**
     * Registry key the bundle registers itself under — the plugin's identity.
     * Comes from the project manifest (`knPluginStudio.pluginKey`) for dev builds.
     */
    pluginKey: string
    /** Runtime name the bundle declares. Display only; never an identity. */
    name: string
    version?: string
    /**
     * Dev builds: the project root.
     *
     * Lets a reload find its own entry even after the project's `pluginKey` was
     * edited, and lets the host bind a dev session to the registry entry it owns
     * (so a build can hot-reload the window with no studio UI involved).
     */
    sourceLabel?: string
    /**
     * Compiled CSS to apply atomically with the code.
     *
     * The bundle also injects its own copy while it is evaluated — a published
     * UMD has to be self-contained — so this is the same stylesheet, re-applied by
     * the host at commit time. That is what makes a *rejected* reload restore the
     * previous styles instead of leaving the panel styled by code that never ran.
     */
    css?: string
}

/** The result of installing a bundle. */
export type PluginInstallOutcome =
    | {
        ok: true
        /** `installed` = new registry key; `reloaded` = replaced the active instance. */
        mode: 'installed' | 'reloaded'
        /** Registry key the plugin is now active under. */
        key: string
        /** Runtime name it is now active under. */
        name: string
        version?: string
        /** A published artifact was replaced: this dev build now shadows it. */
        shadowed?: boolean
    }
    | {
        ok: false
        /** Key the install was attempted for (useful when the plugin is not active). */
        key: string
        /**
         * Why nothing was committed, in the host's own words: the bundle threw
         * while being evaluated, the bundle exports no plugin, its services are
         * owned by someone else, it needs another plugin API version, …
         *
         * Nothing is changed when this is set — the previous version is still
         * running, with its services and its styles.
         */
        reason: string
    }
