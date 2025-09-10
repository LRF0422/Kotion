import { AppContext, Services, ValuesOf } from "@kn/common";
import { useContext, useState } from "react";


export const useService = (service: keyof Services): ValuesOf<Services> => {

    const [services, setServices] = useState<Services>({})

    const { pluginManager } = useContext(AppContext)
    const plugins = pluginManager?.plugins
    plugins?.forEach(it => {
        setServices(se => ({ ...se, ...it.services }))
    })
    return services[service]

};