import { createContext } from "react";
import { PluginManager } from "./PluginManager";


export interface AppContextProps {
    pluginManager: PluginManager | undefined
}

const initalState: AppContextProps = {
    pluginManager: undefined
}

export const AppContext = createContext<AppContextProps>(initalState)