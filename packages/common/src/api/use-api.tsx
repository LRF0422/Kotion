
import request from "../utils/request"
import type { ApiResponse } from "./types"

export interface API<TData = any, TParam = any, TBody = any> {
    name?: string
    url: string
    method: 'POST' | 'GET' | 'DELETE' | 'PUT' | 'PATCH'
    encoding?: 'json' | 'form'
    /** Type-only markers used to infer request and response contracts. */
    readonly __data?: TData
    readonly __param?: TParam
    readonly __body?: TBody
}

// Check if running in Electron environment
export const isElectron = (): boolean => {
    return typeof window !== 'undefined' &&
        typeof (window as any).knDesktop !== 'undefined'
}

const fillPathParam = (url: string, param: any): string => {
    return Object.keys(param || {}).reduce((result, key) => {
        return result.split(`:${key}`).join(encodeURIComponent(String(param[key])))
    }, url)
}

const queryParamsOnly = (url: string, param: any): Record<string, unknown> | undefined => {
    if (!param || typeof param !== 'object') return undefined
    const entries = Object.entries(param).filter(([key]) => !url.includes(`:${key}`))
    return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

// Handle HTTP request — desktop and web both talk to the cloud API directly.
const handleHttpRequest = (
    api: API,
    param?: any,
    body?: any,
    header?: Record<string, string>,
    silent?: boolean,
) => {
    switch (api.method) {
        case "POST": {
            if (api.encoding === 'form') {
                const payload = body instanceof URLSearchParams
                    ? body
                    : { ...((param ?? {}) as Record<string, unknown>), ...((body ?? {}) as Record<string, unknown>) }
                const form = payload instanceof URLSearchParams ? payload : new URLSearchParams()
                if (!(payload instanceof URLSearchParams)) {
                    Object.entries(payload).forEach(([key, value]) => {
                        if (value !== undefined && value !== null && value !== '') form.append(key, String(value))
                    })
                }
                return request({
                    url: fillPathParam(api.url, param),
                    method: 'POST',
                    data: form,
                    silent,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        ...(header || {})
                    }
                })
            }
            return request({
                url: fillPathParam(api.url, param),
                method: 'POST',
                data: body,
                params: queryParamsOnly(api.url, param),
                silent,
                headers: {
                    ...(header || {})
                }
            })
        }
        case "GET":
            return request({
                url: fillPathParam(api.url, param),
                method: 'GET',
                params: param,
                silent
            })
        case "DELETE":
            return request.delete(fillPathParam(api.url, param), {
                params: queryParamsOnly(api.url, param),
                silent
            })
        case "PUT":
            return request.put(fillPathParam(api.url, param), body, { silent })
        case "PATCH":
            return request({
                url: fillPathParam(api.url, param),
                method: 'PATCH',
                data: body,
                silent,
                headers: {
                    ...(header || {})
                }
            })
    }
}

export const handleRequest = <TData = any, TParam = any, TBody = any>(
    api: API<TData, TParam, TBody>,
    param?: TParam,
    body?: TBody,
    header?: Record<string, string>,
    /** Suppress the global error toast for expected failures. */
    silent?: boolean
): Promise<ApiResponse<TData>> => {
    return handleHttpRequest(api, param, body, header, silent) as unknown as Promise<ApiResponse<TData>>
}

export const useApi = <TData = any, TParam = any, TBody = any>(
    api: API<TData, TParam, TBody>,
    param?: TParam,
    body?: TBody,
    header?: Record<string, string>,
    /** Suppress the global error toast for expected failures. */
    silent?: boolean
): Promise<ApiResponse<TData>> => {
    return handleRequest(api, param, body, header, silent)
}
