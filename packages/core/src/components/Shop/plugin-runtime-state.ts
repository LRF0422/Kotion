import type { PluginManagementEntry } from "@kn/common";

/**
 * Install/runtime state for a catalogue plugin.
 *
 * The catalogue list (`GET /plugin`) only knows the *backend install record*,
 * while host-owned and dev plugins live in the runtime registry without such a
 * record. Reading only `installStatus` made every bundled plugin look
 * "not installed" in the manager. This merges both sources:
 *
 * - backend `installStatus` (ACTIVE / DISABLED) — marketplace installs;
 * - runtime registry entry (system / installed / dev) — what is actually loaded.
 */
export interface PluginRuntimeState {
    runtime?: PluginManagementEntry;
    installed: boolean;
    /** A backend install record exists (marketplace install / disable). */
    backendInstalled: boolean;
    active: boolean;
    disabled: boolean;
    /** False for host-owned system plugins, which cannot be unloaded. */
    removable: boolean;
}

export const installStatusValue = (
    installStatus?: string | { value?: string } | null,
): string | undefined => {
    const value = typeof installStatus === "string" ? installStatus : installStatus?.value;
    return value ? value.toUpperCase() : undefined;
};

export const findRuntimeEntry = (
    plugin: { name?: string; pluginKey?: string; key?: string },
    entries: readonly PluginManagementEntry[],
): PluginManagementEntry | undefined =>
    entries.find((entry) => {
        const keys = [plugin.pluginKey, plugin.key].filter(Boolean);
        return (keys.length > 0 && keys.includes(entry.pluginKey)) || entry.name === plugin.name;
    });

export const resolvePluginRuntimeState = (
    plugin: {
        name?: string;
        pluginKey?: string;
        key?: string;
        installStatus?: string | { value?: string } | null;
    },
    entries: readonly PluginManagementEntry[],
    isRemovable: (name: string) => boolean = () => true,
): PluginRuntimeState => {
    const runtime = findRuntimeEntry(plugin, entries);
    const status = installStatusValue(plugin.installStatus);
    const backendInstalled = Boolean(status);
    const active = Boolean(runtime) || status === "ACTIVE";
    const disabled = !runtime && status === "DISABLED";
    return {
        runtime,
        installed: Boolean(runtime) || backendInstalled,
        backendInstalled,
        active,
        disabled,
        removable: runtime ? isRemovable(runtime.name) : true,
    };
};
