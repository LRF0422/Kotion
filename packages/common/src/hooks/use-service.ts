import { AppContext } from "../core/AppContext";
import { Services } from "../core/types";
import { useContext, useEffect, useState, useCallback } from "react";

/**
 * Hook to access registered plugin services with proper TypeScript type inference.
 *
 * Subscribes to the ServiceRegistry so the component re-renders when the
 * requested service is registered or unregistered at runtime.
 *
 * @template K - The service name key from Services interface
 * @param serviceName - The name of the service to retrieve
 * @returns The service instance with correct type based on the service name
 * @throws Error if the service is not registered
 *
 * @example
 * ```typescript
 * // Returns SpaceService type automatically
 * const spaceService = useService("spaceService");
 *
 * // Returns FileService type automatically
 * const fileService = useService("fileService");
 * ```
 */
export const useService = <K extends keyof Services>(serviceName: K): NonNullable<Services[K]> => {
    const { pluginManager } = useContext(AppContext);
    const registry = pluginManager?.serviceRegistry;

    const getService = useCallback((): Services[K] | undefined => {
        return registry?.get(serviceName);
    }, [registry, serviceName]);

    const [service, setService] = useState<Services[K] | undefined>(getService);

    useEffect(() => {
        // Set initial value
        setService(getService());

        // Subscribe to registry changes to re-render when service becomes available
        const unsubscribe = registry?.subscribe((changedName) => {
            if (changedName === serviceName) {
                setService(getService());
            }
        });

        return () => {
            unsubscribe?.();
        };
    }, [registry, serviceName, getService]);

    if (service === undefined || service === null) {
        throw new Error(
            `useService: Service "${String(serviceName)}" is not registered. ` +
            `Make sure the plugin providing this service is installed and loaded.`
        );
    }

    return service as NonNullable<Services[K]>;
};

/**
 * Hook to optionally access a registered service.
 * Unlike useService, this hook returns undefined instead of throwing
 * when the service is not available.
 *
 * @template K - The service name key from Services interface
 * @param serviceName - The name of the service to retrieve
 * @returns The service instance or undefined if not registered
 *
 * @example
 * ```typescript
 * const fileService = useOptionalService("fileService");
 * if (fileService) {
 *     // FileService is available
 *     await fileService.upload();
 * }
 * ```
 */
export const useOptionalService = <K extends keyof Services>(serviceName: K): Services[K] | undefined => {
    const { pluginManager } = useContext(AppContext);
    const registry = pluginManager?.serviceRegistry;

    const getService = useCallback((): Services[K] | undefined => {
        return registry?.get(serviceName);
    }, [registry, serviceName]);

    const [service, setService] = useState<Services[K] | undefined>(getService);

    useEffect(() => {
        // Set initial value
        setService(getService());

        // Subscribe to registry changes
        const unsubscribe = registry?.subscribe((changedName) => {
            if (changedName === serviceName) {
                setService(getService());
            }
        });

        return () => {
            unsubscribe?.();
        };
    }, [registry, serviceName, getService]);

    return service;
};
