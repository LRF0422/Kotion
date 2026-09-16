import { KPlugin, PluginConfig } from '@kn/common'
import { ApiRequestExt } from './extension'

interface ApiClientPluginConfig extends PluginConfig {}

class ApiClientPlugin extends KPlugin<ApiClientPluginConfig> {}

/**
 * Postman-like API client, embedded in documents as an apiRequest block.
 *
 * Desktop-only: requests go through the main process (desktop/http.request) to
 * bypass browser CORS, so the web marketplace marks it as desktop-only.
 *
 * Usage: in a page, type /api to insert the block, then fill in the request.
 */
export const apiClient = new ApiClientPlugin({
    status: 'ACTIVE',
    name: 'API Client',
    desktopOnly: true,
    editorExtension: [ApiRequestExt],
    locales: {
        zh: { translation: { apiClient: { title: '接口调试' } } },
        en: { translation: { apiClient: { title: 'API Client' } } },
    },
})

export { ApiRequestExt } from './extension'
export { ApiRequestNode } from './extension/api-request-node'
