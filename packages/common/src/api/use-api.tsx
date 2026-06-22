
import request from "../utils/request"

export interface API {
    name: string,
    url: string,
    method: 'POST' | 'GET' | 'DELETE' | 'PUT' | 'PATCH',
}

// Check if running in Electron environment
export const isElectron = (): boolean => {
    return typeof window !== 'undefined' &&
        typeof (window as any).api !== 'undefined'
}

const fillPathParam = (url: string, param: any): string => {
    let res = ""
    if (url.includes(":")) {
        Object.keys(param || {}).forEach(it => {
            if (url.includes(":" + it)) {
                res = url.replace(":" + it, param[it])
            }
        })
        return res;
    }
    return url;
}

// Handle HTTP request — desktop and web both talk to the cloud API directly.
const handleHttpRequest = (api: API, param?: any, body?: any, header?: Record<string, string>) => {
    switch (api.method) {
        case "POST":
            return request({
                url: fillPathParam(api.url, param),
                method: 'POST',
                data: body,
                params: param,
                headers: {
                    ...(header || {})
                }
            })
        case "GET":
            return request({
                url: fillPathParam(api.url, param),
                method: 'GET',
                params: param
            })
        case "DELETE":
            return request.delete(fillPathParam(api.url, param), param)
        case "PUT":
            return request.put(fillPathParam(api.url, param), body)
        case "PATCH":
            return request({
                url: fillPathParam(api.url, param),
                method: 'PATCH',
                data: body,
                headers: {
                    ...(header || {})
                }
            })
    }
}

export const handleRequest = (api: API, param?: any, body?: any, header?: Record<string, string>) => {
    return handleHttpRequest(api, param, body, header)
}

export const useApi = (api: API, param?: any, body?: any, header?: Record<string, string>) => {
    return handleRequest(api, param, body, header)
}
