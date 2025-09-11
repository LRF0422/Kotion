import { AppContext, Services, ValuesOf } from "@kn/common";
import { useContext, useEffect, useState } from "react";


export const useService = (serviceName: keyof Services): ValuesOf<Services> => {


    const { pluginManager } = useContext(AppContext)
    const [service, setService] = useState<ValuesOf<Services>>(pluginManager!.pluginServices[serviceName])
    useEffect(() => {
        setService(pluginManager!.pluginServices[serviceName])
    }, [serviceName])
    return service

};