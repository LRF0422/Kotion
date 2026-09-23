import { APIS, useApi } from '@kn/common'
import type {
    PluginArtifactUpload,
    PluginMarketplaceInstalled,
    PluginMarketplaceMine,
    PluginMarketplaceService,
    PluginPublisherPrefill,
    PluginSubmitInput,
    PluginVersionInput,
} from '@kn/common'

export interface PublisherRequest {
    pluginId?: string | number
    prefill?: PluginPublisherPrefill
    artifact?: { resourcePath: string; integrity?: string }
}

const publisherListeners = new Set<(request: PublisherRequest) => void>()

/** Subscribe to "open the publish flow" requests; the host UI listens. */
export const subscribePublisherRequests = (
    listener: (request: PublisherRequest) => void,
): (() => void) => {
    publisherListeners.add(listener)
    return () => {
        publisherListeners.delete(listener)
    }
}

const asArray = <T>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[]
    if (value && typeof value === 'object') {
        const records = (value as { records?: unknown }).records
        if (Array.isArray(records)) return records as T[]
    }
    return []
}

/**
 * Core implementation of the plugin-marketplace service.
 *
 * Thin wrappers over the catalogue API, so the Shop UI and the plugin studio
 * submit / publish / upgrade through one code path instead of each calling
 * `useApi` directly.
 */
export const createPluginMarketplaceService = (): PluginMarketplaceService => ({
    async listMine() {
        const response = await useApi(APIS.GET_MY_PLUGIN_SUBMISSIONS)
        return asArray<PluginMarketplaceMine>((response as { data?: unknown })?.data)
    },
    async listInstalled() {
        const response = await useApi(APIS.GET_INSTALLED_PLUGINS)
        return asArray<PluginMarketplaceInstalled>((response as { data?: unknown })?.data)
    },
    async uploadArtifact({ fileName, data }) {
        const file = new File([data], fileName, { type: 'text/javascript' })
        const response = await useApi(
            APIS.UPLOAD_PLUGIN_FILE,
            null,
            { file },
            { 'Content-Type': 'multipart/form-data' },
        )
        const uploaded = (response as { data?: { name?: string; integrity?: string } })?.data ?? {}
        const result: PluginArtifactUpload = {
            resourcePath: uploaded.name ?? fileName,
            integrity: uploaded.integrity,
        }
        return result
    },
    submit: (input: PluginSubmitInput) =>
        useApi(APIS.SUBMIT_PLUGIN, null, input) as Promise<unknown>,
    resubmit: (id: string | number, input: PluginSubmitInput) =>
        useApi(APIS.RESUBMIT_PLUGIN, { id }, input) as Promise<unknown>,
    publishVersion: (pluginId: string | number, input: PluginVersionInput) =>
        useApi(APIS.PUBLISH_PLUGIN_VERSION, { id: pluginId }, input) as Promise<unknown>,
    async upgrade(versionId: string | number) {
        await useApi(APIS.UPDATE_PLUGIN, { versionId }, undefined, undefined, true)
    },
    openPublisher(options) {
        const request: PublisherRequest = {
            pluginId: options?.pluginId,
            prefill: options?.prefill,
            artifact: options?.artifact,
        }
        publisherListeners.forEach((listener) => listener(request))
    },
})
