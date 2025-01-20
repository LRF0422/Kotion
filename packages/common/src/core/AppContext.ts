import { createContext } from "react";
import { PluginManager } from "./PluginManager";


export interface AppContextProps {
    pluginManager?: PluginManager
}

export const AppContext = createContext<AppContextProps>({})