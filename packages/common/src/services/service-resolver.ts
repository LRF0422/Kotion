import type { ServiceRegistryView } from "../core/ServiceRegistry";
import type { Services } from "../core/types";

export interface ServiceRegistryReader<TServices extends object> {
    get<K extends keyof TServices>(name: K): TServices[K] | undefined;
}

/** Imperative counterpart to useService/useOptionalService for non-React code. */
export class ServiceResolver<TServices extends object> {
    private _bindings: Array<{ registry: ServiceRegistryReader<TServices> }> = [];

    bind(registry: ServiceRegistryReader<TServices>): () => void {
        const binding = { registry };
        this._bindings.push(binding);
        return () => {
            const index = this._bindings.indexOf(binding);
            if (index >= 0) this._bindings.splice(index, 1);
        };
    }

    unbind(registry?: ServiceRegistryReader<TServices>): void {
        this._bindings = registry
            ? this._bindings.filter(binding => binding.registry !== registry)
            : [];
    }

    get registry(): ServiceRegistryReader<TServices> | undefined {
        return this._bindings[this._bindings.length - 1]?.registry;
    }

    resolveOptional<K extends keyof TServices>(name: K): TServices[K] | undefined {
        return this.registry?.get(name);
    }

    resolve<K extends keyof TServices>(name: K): NonNullable<TServices[K]> {
        if (!this.registry) {
            throw new Error("ServiceResolver: No ServiceRegistryView is bound");
        }

        const service = this.registry.get(name);
        if (service === undefined || service === null) {
            throw new Error(`ServiceResolver: Service "${String(name)}" is not registered`);
        }
        return service as NonNullable<TServices[K]>;
    }
}

export const createServiceResolver = <TServices extends object>(): ServiceResolver<TServices> =>
    new ServiceResolver<TServices>();

const defaultServiceResolver = createServiceResolver<Services>();

export const bindServiceRegistry = (registry: ServiceRegistryView): (() => void) =>
    defaultServiceResolver.bind(registry);

export const unbindServiceRegistry = (registry?: ServiceRegistryView): void =>
    defaultServiceResolver.unbind(registry);

export const getBoundServiceRegistry = (): ServiceRegistryView | undefined =>
    defaultServiceResolver.registry as ServiceRegistryView | undefined;

export const resolveOptionalService = <K extends keyof Services>(name: K): Services[K] | undefined =>
    defaultServiceResolver.resolveOptional(name);

export const resolveService = <K extends keyof Services>(name: K): NonNullable<Services[K]> =>
    defaultServiceResolver.resolve(name);
