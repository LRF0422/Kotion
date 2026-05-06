import { Services } from "./types";
import { logger } from "../utils/logger";

type ServiceChangeListener = (name: string) => void;

/**
 * ServiceRegistry - Centralized runtime service registration manager.
 *
 * Inspired by Tiptap's command system, this registry allows plugins to
 * register and unregister services at runtime. The useService hook
 * subscribes to change events so React components re-render when
 * services become available or are removed.
 *
 * Plugins augment the `Services` interface via TypeScript module augmentation:
 *
 * @example
 * ```typescript
 * declare module '@kn/common' {
 *     interface Services {
 *         myService: MyServiceType;
 *     }
 * }
 * ```
 *
 * Then register at runtime:
 * ```typescript
 * pluginManager.serviceRegistry.register('myService', myServiceImpl);
 * ```
 */
export class ServiceRegistry {
    private _services: Services = {} as Services;
    private _listeners: Set<ServiceChangeListener> = new Set();

    /**
     * Register a service by name.
     * If a service with the same name already exists, it will be overwritten
     * and listeners will be notified.
     */
    register<K extends keyof Services>(name: K, service: Services[K]): void {
        this._services[name] = service;
        logger.debug(`ServiceRegistry: registered "${String(name)}"`);
        this._notify(name);
    }

    /**
     * Unregister a service by name.
     * No-op if the service does not exist.
     */
    unregister(name: keyof Services): void {
        if (name in this._services) {
            delete this._services[name];
            logger.debug(`ServiceRegistry: unregistered "${String(name)}"`);
            this._notify(name);
        }
    }

    /**
     * Get a service by name.
     * Returns undefined if the service is not registered.
     */
    get<K extends keyof Services>(name: K): Services[K] {
        return this._services[name];
    }

    /**
     * Check if a service is registered.
     */
    has(name: keyof Services): boolean {
        return name in this._services;
    }

    /**
     * Get a snapshot of all registered services.
     */
    getAll(): Services {
        return { ...this._services };
    }

    /**
     * Subscribe to service changes.
     * The listener is called whenever a service is registered or unregistered.
     *
     * @returns An unsubscribe function
     */
    subscribe(listener: ServiceChangeListener): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    /**
     * Register multiple services at once (bulk registration).
     * Only fires one notification per service after all are registered.
     */
    registerAll(services: Partial<Services>): void {
        // Use Object.assign for type-safe bulk registration
        // TypeScript can't verify individual key-value pairs in a loop,
        // but Object.assign preserves the structure correctly.
        Object.assign(this._services, services);
        // Notify for each registered key
        const keys = Object.keys(services) as Array<keyof Services>;
        for (const key of keys) {
            if (services[key] !== undefined) {
                logger.debug(`ServiceRegistry: registered "${String(key)}" (bulk)`);
                this._notify(key);
            }
        }
    }

    /**
     * Remove all registered services and clear listeners.
     * Useful for testing or full reset.
     */
    clear(): void {
        const names = Object.keys(this._services) as Array<keyof Services>;
        this._services = {} as Services;
        for (const name of names) {
            this._notify(name);
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
