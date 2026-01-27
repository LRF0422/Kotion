
import request from "../utils/request"

export interface API {
    name: string,
    url: string,
    method: 'POST' | 'GET' | 'DELETE' | 'PUT',
    ipcChannel?: string, // Optional IPC channel for Electron
}

// Check if running in Electron environment
export const isElectron = (): boolean => {
    return typeof window !== 'undefined' &&
        typeof (window as any).api !== 'undefined'
}

// URL to IPC channel mapping
const urlToIpcChannel: Record<string, string> = {
    // Auth - removed, use HTTP for login/register
    // User
    '/knowledge-system/user/info': 'user:getInfo',
    '/knowledge-system/user/search': 'user:search',
    // Space
    '/knowledge-wiki/space/list': 'space:list',
    '/knowledge-wiki/space/personal': 'space:getPersonal',
    '/knowledge-wiki/space': 'space:create',
    // Plugin
    '/knowledge-wiki/plugin': 'plugin:list',
    '/knowledge-wiki/plugin/install': 'plugin:install',
    '/knowledge-wiki/plugin/install/list': 'plugin:getInstalled',
    '/knowledge-wiki/plugin/uninstall': 'plugin:uninstall',
    '/knowledge-wiki/plugin/update': 'plugin:update',
    // File
    '/knowledge-resource/oss/endpoint/put-file': 'file:upload',
    '/knowledge-file-center/folder/root': 'file:getRootFolder',
    '/knowledge-file-center/folder/children': 'file:getChildren',
    '/knowledge-file-center/file': 'file:createFolder',
    '/knowledge-file-center/file/download': 'file:download',
    // Page
    '/knowledge-wiki/space/page': 'page:save',
    '/knowledge-wiki/space/page/list': 'page:list',
    '/knowledge-wiki/space/page/favorites': 'page:getFavorites',
    '/knowledge-wiki/space/page/recent': 'page:getRecent',
    '/knowledge-wiki/space/page/templates': 'page:getTemplates',
    '/knowledge-wiki/space/page/blocks': 'page:getBlocks',
    '/knowledge-wiki/space/page/block': 'page:getBlockInfo',
    // IM - removed, use HTTP for WebSocket operations
}

// URLs that should always use HTTP (remote API) even in Electron
const httpOnlyUrls = [
    '/knowledge-auth/token',           // Login
    '/knowledge-system/user/register', // Register
    '/instant-message/',               // All IM/WebSocket operations
]

// Get IPC channel from URL
const getIpcChannel = (url: string, method: string): string | null => {
    // Handle dynamic URL patterns
    const patterns: Array<{ pattern: RegExp; channel: string }> = [
        { pattern: /\/knowledge-wiki\/space\/([^/]+)\/detail/, channel: 'space:getDetail' },
        { pattern: /\/knowledge-wiki\/space\/([^/]+)\/page\/tree/, channel: 'page:getTree' },
        { pattern: /\/knowledge-wiki\/space\/page\/([^/]+)\/content/, channel: 'page:getContent' },
        { pattern: /\/knowledge-wiki\/space\/page\/([^/]+)\/trash/, channel: 'page:moveToTrash' },
        { pattern: /\/knowledge-wiki\/space\/page\/([^/]+)\/restore/, channel: 'page:restore' },
        { pattern: /\/knowledge-wiki\/space\/page\/([^/]+)\/template/, channel: 'page:saveAsTemplate' },
        { pattern: /\/knowledge-wiki\/space\/page\/([^/]+)\/favorite/, channel: 'page:addFavorite' },
        { pattern: /\/knowledge-wiki\/space\/page\/([^/]+)\/collaborators/, channel: 'page:getCollaborators' },
        { pattern: /\/knowledge-wiki\/space\/([^/]+)\/favorite/, channel: 'space:addFavorite' },
        { pattern: /\/knowledge-wiki\/space\/([^/]+)\/members/, channel: 'space:getMembers' },
        { pattern: /\/knowledge-wiki\/plugin\/([^/]+)/, channel: 'plugin:get' },
        { pattern: /\/knowledge-wiki\/favorite\/([^/]+)/, channel: 'page:removeFavorite' },
        // IM patterns removed - use HTTP for WebSocket operations
    ]

    // Check static mappings first
    if (urlToIpcChannel[url]) {
        return urlToIpcChannel[url]
    }

    // Check dynamic patterns
    for (const { pattern, channel } of patterns) {
        if (pattern.test(url)) {
            return channel
        }
    }

    return null
}

// Extract ID from dynamic URL
const extractIdFromUrl = (url: string): string | null => {
    const patterns = [
        /\/([^/]+)\/detail$/,
        /\/([^/]+)\/page\/tree$/,
        /\/page\/([^/]+)\/content$/,
        /\/page\/([^/]+)\/trash$/,
        /\/page\/([^/]+)\/restore$/,
        /\/page\/([^/]+)\/template$/,
        /\/page\/([^/]+)\/favorite$/,
        /\/page\/([^/]+)\/collaborators$/,
        /\/space\/([^/]+)\/favorite$/,
        /\/space\/([^/]+)\/members$/,
        /\/plugin\/([^/]+)$/,
        /\/favorite\/([^/]+)$/,
        // IM patterns removed - use HTTP for WebSocket operations
    ]

    for (const pattern of patterns) {
        const match = url.match(pattern)
        if (match && match[1]) {
            return match[1]
        }
    }

    return null
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

// Handle Electron IPC request
const handleElectronRequest = async (api: API, param?: any, body?: any): Promise<any> => {
    const electronApi = (window as any).api
    const filledUrl = fillPathParam(api.url, param)
    const ipcChannel = getIpcChannel(filledUrl, api.method)

    if (!ipcChannel) {
        console.warn(`No IPC channel mapping for URL: ${filledUrl}, falling back to HTTP`)
        return handleHttpRequest(api, param, body)
    }

    // Extract ID for dynamic routes
    const id = extractIdFromUrl(filledUrl)

    // Prepare data for IPC
    let ipcData: any = body || param || {}
    if (id && !ipcData.id) {
        ipcData = id
    }

    // Special handling for specific channels
    if (ipcChannel === 'page:getTree' && param) {
        ipcData = { spaceId: param.id, searchValue: param.searchValue }
    }

    try {
        const result = await electronApi.invoke(ipcChannel, ipcData)
        return result
    } catch (error) {
        console.error(`IPC error for ${ipcChannel}:`, error)
        throw error
    }
}

// Handle HTTP request (original implementation)
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
            return request.put(fillPathParam(api.url, param), param)
    }
}

export const handleRequest = (api: API, param?: any, body?: any, header?: Record<string, string>) => {
    const filledUrl = fillPathParam(api.url, param)

    // Check if this URL should always use HTTP (e.g., login, register)
    const shouldUseHttp = httpOnlyUrls.some(url => filledUrl.includes(url))

    // Use Electron IPC if available and URL is not HTTP-only
    if (isElectron() && !shouldUseHttp) {
        return handleElectronRequest(api, param, body)
    }

    // Fall back to HTTP
    return handleHttpRequest(api, param, body, header)
}

export const useApi = (api: API, param?: any, body?: any, header?: Record<string, string>) => {
    return handleRequest(api, param, body, header)
}