import { Services } from "./types";
import { logger } from "../utils/logger";

type ServiceChangeListener = (name: string) => void;

export interface CoreServiceOwner {
    type: "core";
}

export interface PluginServiceOwner {
    type: "plugin";
    pluginName: string;
}

export type ServiceOwner = CoreServiceOwner | PluginServiceOwner;

export const CORE_SERVICE_OWNER: CoreServiceOwner = Object.freeze({ type: "core" });

export const pluginServiceOwner = (pluginName: string): PluginServiceOwner => ({
    type: "plugin",
    pluginName,
});

const ownerKey = (owner: ServiceOwner): string =>
    owner.type === "core" ? "core" : `plugin:${owner.pluginName}`;

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

interface ServiceEntry<K extends keyof Services = keyof Services> {
    service: Services[K];
    owner: ServiceOwner;
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

    /** Atomically replace all plugin-owned services while preserving core services. */
    replacePluginServices(
        registrations: Array<{ owner: PluginServiceOwner; services: Partial<Services> }>
    ): Set<string> {
        const nextEntries = new Map<keyof Services, ServiceEntry>();
        for (const [name, entry] of this._entries) {
            if (entry.owner.type === "core") nextEntries.set(name, entry);
        }

        const conflicts = new Set<string>();
        for (const { owner, services } of registrations) {
            const entries = Object.entries(services)
                .filter(([, service]) => service !== undefined) as Array<
                    [keyof Services, Services[keyof Services]]
                >;
            const conflict = entries.some(([name]) => {
                const existing = nextEntries.get(name);
                return existing && ownerKey(existing.owner) !== ownerKey(owner);
            });
            if (conflict) {
                conflicts.add(owner.pluginName);
                continue;
            }
            for (const [name, service] of entries) {
                nextEntries.set(name, { service, owner } as ServiceEntry);
            }
        }

        const previousEntries = this._entries;
        const changed = new Set<keyof Services>([
            ...previousEntries.keys(),
            ...nextEntries.keys(),
        ]);
        this._entries = nextEntries;
        for (const name of changed) {
            const previous = previousEntries.get(name);
            const next = nextEntries.get(name);
            if (
                previous?.service !== next?.service
                || (!previous && !!next)
                || (!!previous && !next)
                || (previous && next && ownerKey(previous.owner) !== ownerKey(next.owner))
            ) {
                this._notify(name);
            }
        }
        return conflicts;
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
