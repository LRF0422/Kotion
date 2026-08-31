import { createContext } from "react";
import { PluginManager } from "./PluginManager";
import type { ServiceRegistryView } from "./ServiceRegistry";


export interface AppContextProps {
    pluginManager: PluginManager | undefined
    /**
     * Read-only access to registered services.
     * Also available via pluginManager.serviceRegistry.
     */
    serviceRegistry?: ServiceRegistryView
}

const initalState: AppContextProps = {
    pluginManager: undefined,
    serviceRegistry: undefined
}

export const AppContext = createContext<AppContextProps>(initalState)