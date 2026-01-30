import { AppContext, Services } from "@kn/common";
import { useContext, useEffect, useState } from "react";

/**
 * Hook to access registered plugin services with proper TypeScript type inference.
 * 
 * @template K - The service name key from Services interface
 * @param serviceName - The name of the service to retrieve
 * @returns The service instance with correct type based on the service name
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
export const useService = <K extends keyof Services>(serviceName: K): Services[K] => {
    const { pluginManager } = useContext(AppContext);
    const [service, setService] = useState<Services[K]>(
        pluginManager?.pluginServices[serviceName] as Services[K]
    );

    useEffect(() => {
        setService(pluginManager?.pluginServices[serviceName] as Services[K]);
    }, [serviceName, pluginManager]);

    return service;
};