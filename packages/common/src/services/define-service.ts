import type { Services } from "../core/types";

/**
 * Declare a typed service contribution for a KPlugin.
 *
 * Runtime registration is intentionally owned by PluginManager so plugins
 * cannot impersonate core or another plugin's service owner.
 */
export function defineService<K extends keyof Services, TArgs extends unknown[] = []>(
    name: K,
    factory: (...args: TArgs) => Services[K]
): (...args: TArgs) => { [P in K]: Services[K] } {
    return (...args: TArgs) => ({
        [name]: factory(...args),
    }) as { [P in K]: Services[K] };
}
