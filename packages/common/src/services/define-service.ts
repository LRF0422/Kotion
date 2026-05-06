import { ServiceRegistry } from "../core/ServiceRegistry";
import { Services } from "../core/types";

/**
 * defineService - A Tiptap-inspired helper for declaring and registering services.
 *
 * This utility provides a clean, type-safe way to define a service and
 * produce a registration function. It pairs with TypeScript module augmentation
 * to add the service type to the `Services` interface.
 *
 * @example
 * ```typescript
 * // 1. Define the service type and augment Services interface
 * declare module '@kn/common' {
 *     interface Services {
 *         myService: MyServiceType;
 *     }
 * }
 *
 * // 2. Define the service factory
 * export const registerMyService = defineService('myService', (deps?: MyDeps) => ({
 *     doSomething: async () => { ... },
 *     getData: (id: string) => { ... },
 * }));
 *
 * // 3. Register the service at plugin init time
 * const myPlugin = new KPlugin({
 *     name: 'my-plugin',
 *     services: registerMyService(myDeps),
 *     // or register later:
 *     // registerMyService(myDeps)(pluginManager.serviceRegistry)
 * });
 * ```
 *
 * @param name - The service name (must match a key in the Services interface)
 * @param factory - A factory function that creates the service implementation
 * @returns A function that, when called with factory args, returns a Services object
 *          suitable for KPlugin's `services` config, AND has a `register` method
 *          for direct ServiceRegistry registration.
 */
export function defineService<K extends keyof Services, TArgs extends unknown[] = []>(
    name: K,
    factory: (...args: TArgs) => Services[K]
): (...args: TArgs) => { [P in K]: Services[K] } & {
    register: (registry: ServiceRegistry, ...args: TArgs) => void;
} {
    const createService = (...args: TArgs) => {
        const service = factory(...args);
        const result = { [name]: service } as { [P in K]: Services[K] } & {
            register: (registry: ServiceRegistry, ...regArgs: TArgs) => void;
        };
        result.register = (registry: ServiceRegistry, ...regArgs: TArgs) => {
            const svc = factory(...regArgs);
            registry.register(name, svc);
        };
        return result;
    };
    return createService;
}
