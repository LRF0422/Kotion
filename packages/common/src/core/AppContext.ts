import { createContext } from "react";
import { PluginManager } from "./PluginManager";
import { ServiceRegistry } from "./ServiceRegistry";


export interface AppContextProps {
    pluginManager: PluginManager | undefined
    /**
     * Direct access to the ServiceRegistry for runtime service management.
     * Also available via pluginManager.serviceRegistry.
     */
    serviceRegistry?: ServiceRegistry
}

const initalState: AppContextProps = {
    pluginManager: undefined,
    serviceRegistry: undefined
}

export const AppContext = createContext<AppContextProps>(initalState)