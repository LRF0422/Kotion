import { APIS, useApi } from '@kn/common'
import type {
    DeveloperVerificationSummary,
    PluginArtifactUpload,
    PluginMarketplaceInstalled,
    PluginMarketplaceMine,
    PluginMarketplaceService,
    PluginPublisherPrefill,
    PluginSubmitInput,
    PluginVersionInput,
} from '@kn/common'
import { developerStatus, fetchDeveloperProfile } from '../components/Developer/developer-api'

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

const verificationListeners = new Set<() => void>()

/** Subscribe to "open developer verification" requests; the host UI listens. */
export const subscribeDeveloperVerificationRequests = (listener: () => void): (() => void) => {
    verificationListeners.add(listener)
    return () => {
        verificationListeners.delete(listener)
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
        // Keep the caller's content type: the same endpoint carries the bundle
        // (text/javascript) and the plugin's icon (image/svg+xml, …). Forcing
        // `text/javascript` on an image made the stored object mislabelled.
        const file = new File([data], fileName, { type: data.type || 'text/javascript' })
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
    async getDeveloperProfile(): Promise<DeveloperVerificationSummary | null> {
        const profile = await fetchDeveloperProfile()
        if (!profile) return null
        // Flatten the platform's { value, desc } enum so callers can compare a
        // plain string without knowing the wire format.
        return { ...profile, status: developerStatus(profile) }
    },
    openDeveloperVerification() {
        verificationListeners.forEach((listener) => listener())
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
