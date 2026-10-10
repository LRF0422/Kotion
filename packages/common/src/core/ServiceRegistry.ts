import { Services } from "./types";
import { logger } from "../utils/logger";

type ServiceChangeListener = (name: string) => void;

export interface CoreServiceOwner {
    type: "core";
}

export interface PluginServiceOwner {
    type: "plugin";
    /**
     * The plugin's **registry key** — its stable identity, and what ownership is
     * decided by. A plugin's display `name` is not an identity: two builds of one
     * plugin can declare different names (a translated `name`, an edited
     * `displayName`), and they must still be the same owner.
     */
    pluginKey: string;
    /** Display name, for humans reading the registry (dashboards, discovery). */
    pluginName: string;
}

export type ServiceOwner = CoreServiceOwner | PluginServiceOwner;

export const CORE_SERVICE_OWNER: CoreServiceOwner = Object.freeze({ type: "core" });

export const pluginServiceOwner = (
    pluginKey: string,
    pluginName: string = pluginKey,
): PluginServiceOwner => ({
    type: "plugin",
    pluginKey,
    pluginName,
});

const ownerKey = (owner: ServiceOwner): string =>
    owner.type === "core" ? "core" : `plugin:${owner.pluginKey}`;

const ownerLabel = (owner: ServiceOwner): string =>
    owner.type === "core" ? "core" : `plugin "${owner.pluginName}"`;

export class ServiceRegistrationError extends Error {
    constructor(
        public readonly serviceName: keyof Services,
        public readonly existingOwner: ServiceOwner,
        public readonly requestedOwner: ServiceOwner
    ) {
        super(
            `ServiceRegistry: Service "${String(serviceName)}" is owned by ${ownerLabel(existingOwner)} ` +
            `and cannot be registered by ${ownerLabel(requestedOwner)}`
        );
        this.name = "ServiceRegistrationError";
    }
}

export interface ServiceEntry<K extends keyof Services = keyof Services> {
    service: Services[K];
    owner: ServiceOwner;
}

/**
 * What the service table would look like after a plugin set change.
 *
 * Planning is separated from applying so a registry change can be **rejected
 * before it happens**: the plugin manager plans the whole next state, refuses the
 * activation if the incoming plugin would lose its services to an existing owner,
 * and only then commits. Without the split, "the plugin is active but its
 * services were silently dropped" was a reachable half-committed state.
 */
export interface PluginServicePlan {
    /** The complete table the registry would hold. */
    entries: Map<keyof Services, ServiceEntry>;
    /** Owners whose whole registration was skipped, and the names they wanted. */
    conflicts: Array<{ owner: PluginServiceOwner; names: Array<keyof Services> }>;
}

export interface ServiceRegistryView {
    get<K extends keyof Services>(name: K): Services[K] | undefined;
    getOwner(name: keyof Services): ServiceOwner | undefined;
    has(name: keyof Services): boolean;
    getAll(): Services;
    subscribe(listener: ServiceChangeListener): () => void;
}

/**
 * Centralized runtime service registry with explicit ownership.
 *
 * Services are atomic values: registration replaces the whole value only when
 * the same owner re-registers it. A plugin can never overwrite a core service
 * or another plugin's service.
 */
export class ServiceRegistry {
    private _entries = new Map<keyof Services, ServiceEntry>();
    private _listeners: Set<ServiceChangeListener> = new Set();

    constructor(initialCoreServices?: Partial<Services>) {
        if (initialCoreServices) {
            this.registerAll(initialCoreServices, CORE_SERVICE_OWNER);
        }
    }

    register<K extends keyof Services>(
        name: K,
        service: Services[K],
        owner: ServiceOwner
    ): void {
        this._assertCanRegister(name, owner);
        this._entries.set(name, { service, owner } as ServiceEntry);
        logger.debug(`ServiceRegistry: registered "${String(name)}" for ${ownerLabel(owner)}`);
        this._notify(name);
    }

    unregister(name: keyof Services, owner: ServiceOwner): boolean {
        const entry = this._entries.get(name);
        if (!entry || ownerKey(entry.owner) !== ownerKey(owner)) {
            return false;
        }

        this._entries.delete(name);
        logger.debug(`ServiceRegistry: unregistered "${String(name)}" from ${ownerLabel(entry.owner)}`);
        this._notify(name);
        return true;
    }

    unregisterOwner(owner: ServiceOwner): Array<keyof Services> {
        const key = ownerKey(owner);
        const removed: Array<keyof Services> = [];
        for (const [name, entry] of this._entries) {
            if (ownerKey(entry.owner) !== key) continue;
            this._entries.delete(name);
            removed.push(name);
        }

        for (const name of removed) {
            logger.debug(`ServiceRegistry: unregistered "${String(name)}" from ${ownerLabel(owner)}`);
            this._notify(name);
        }
        return removed;
    }

    unregisterPluginServices(): Array<keyof Services> {
        const removed: Array<keyof Services> = [];
        for (const [name, entry] of this._entries) {
            if (entry.owner.type !== "plugin") continue;
            this._entries.delete(name);
            removed.push(name);
        }

        for (const name of removed) {
            this._notify(name);
        }
        return removed;
    }

    /**
     * Compute the plugin-owned service table for a candidate plugin set.
     *
     * Pure: nothing is registered, nothing is notified. Core services are
     * preserved. A registration is skipped **whole** when any of its names is
     * already held by a different owner (a plugin can never take over another
     * plugin's service), and that skip is *reported* rather than applied.
     */
    planPluginServices(
        registrations: Array<{ owner: PluginServiceOwner; services: Partial<Services> }>
    ): PluginServicePlan {
        const entries = new Map<keyof Services, ServiceEntry>();
        for (const [name, entry] of this._entries) {
            if (entry.owner.type === "core") entries.set(name, entry);
        }

        const conflicts: PluginServicePlan["conflicts"] = [];
        for (const { owner, services } of registrations) {
            const wanted = Object.entries(services)
                .filter(([, service]) => service !== undefined) as Array<
                    [keyof Services, Services[keyof Services]]
                >;
            const conflict = wanted.some(([name]) => {
                const existing = entries.get(name);
                return existing && ownerKey(existing.owner) !== ownerKey(owner);
            });
            if (conflict) {
                conflicts.push({ owner, names: wanted.map(([name]) => name) });
                continue;
            }
            for (const [name, service] of wanted) {
                entries.set(name, { service, owner } as ServiceEntry);
            }
        }

        return { entries, conflicts };
    }

    /**
     * Install a planned table and notify exactly the names that changed.
     *
     * The only mutation point for plugin-owned services, so "plan → validate →
     * apply" is the single path (see {@link PluginServicePlan}).
     */
    applyPluginServices(plan: PluginServicePlan): void {
        const previousEntries = this._entries;
        this._entries = plan.entries;
        const changed = new Set<keyof Services>([
            ...previousEntries.keys(),
            ...plan.entries.keys(),
        ]);
        for (const name of changed) {
            const previous = previousEntries.get(name);
            const next = plan.entries.get(name);
            if (
                previous?.service !== next?.service
                || (!previous && !!next)
                || (!!previous && !next)
                || (previous && next && ownerKey(previous.owner) !== ownerKey(next.owner))
            ) {
                this._notify(name);
            }
        }
    }

    /**
     * Atomically replace all plugin-owned services while preserving core
     * services. Returns the plugin keys whose registration was skipped.
     */
    replacePluginServices(
        registrations: Array<{ owner: PluginServiceOwner; services: Partial<Services> }>
    ): Set<string> {
        const plan = this.planPluginServices(registrations);
        this.applyPluginServices(plan);
        return new Set(plan.conflicts.map(({ owner }) => owner.pluginKey));
    }

    get<K extends keyof Services>(name: K): Services[K] | undefined {
        return this._entries.get(name)?.service as Services[K] | undefined;
    }

    getOwner(name: keyof Services): ServiceOwner | undefined {
        return this._entries.get(name)?.owner;
    }

    has(name: keyof Services): boolean {
        return this._entries.has(name);
    }

    getAll(): Services {
        const services = {} as Services;
        for (const [name, entry] of this._entries) {
            Reflect.set(services, name, entry.service);
        }
        return services;
    }

    subscribe(listener: ServiceChangeListener): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    /** Register a group atomically: either every service is accepted or none are. */
    registerAll(
        services: Partial<Services>,
        owner: ServiceOwner
    ): void {
        const entries = Object.entries(services)
            .filter(([, service]) => service !== undefined) as Array<
                [keyof Services, Services[keyof Services]]
            >;

        for (const [name] of entries) {
            this._assertCanRegister(name, owner);
        }
        for (const [name, service] of entries) {
            this._entries.set(name, { service, owner } as ServiceEntry);
            logger.debug(`ServiceRegistry: registered "${String(name)}" for ${ownerLabel(owner)} (bulk)`);
        }
        for (const [name] of entries) {
            this._notify(name);
        }
    }

    canRegisterAll(services: Partial<Services>, owner: ServiceOwner): boolean {
        try {
            for (const name of Object.keys(services) as Array<keyof Services>) {
                if (services[name] !== undefined) this._assertCanRegister(name, owner);
            }
            return true;
        } catch (error) {
            if (error instanceof ServiceRegistrationError) return false;
            throw error;
        }
    }

    /** Remove services. Core services are preserved when preserveCore is true. */
    clear(options?: { preserveCore?: boolean }): void {
        const names: Array<keyof Services> = [];
        for (const [name, entry] of this._entries) {
            if (options?.preserveCore && entry.owner.type === "core") continue;
            this._entries.delete(name);
            names.push(name);
        }
        for (const name of names) {
            this._notify(name);
        }
    }

    private _assertCanRegister(name: keyof Services, owner: ServiceOwner): void {
        const existing = this._entries.get(name);
        if (existing && ownerKey(existing.owner) !== ownerKey(owner)) {
            throw new ServiceRegistrationError(name, existing.owner, owner);
        }
    }

    private _notify(name: keyof Services): void {
        const nameStr = String(name);
        this._listeners.forEach(listener => {
            try {
                listener(nameStr);
            } catch (err) {
                logger.error(`ServiceRegistry: error in listener for "${nameStr}"`, err);
            }
        });
    }
}
