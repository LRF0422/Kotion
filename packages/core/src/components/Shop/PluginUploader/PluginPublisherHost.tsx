/**
 * Host-side publisher: renders the real publish wizard when a plugin asks for
 * it through the pluginMarketplace service.
 *
 * The publish UI lives here in @kn/core; plugins only call
 * `pluginMarketplace.openPublisher(...)` from @kn/common, so they never import
 * core.
 */
import React from 'react'
import type { PluginPublisherPrefill } from '@kn/common'

import { subscribePublisherRequests, type PublisherRequest } from '../../../services/plugin-marketplace'
import type { PluginSubmissionValues } from './types'
import { PluginUploader } from './index'
import { PluginVersionPublisher } from '../PluginManager/PluginVersionPublisher'

const toInitialValues = (
    prefill?: PluginPublisherPrefill,
): Partial<PluginSubmissionValues> | undefined => {
    if (!prefill) return undefined
    const values: Partial<PluginSubmissionValues> = {}
    if (prefill.name) values.name = prefill.name
    if (prefill.pluginKey) values.pluginKey = prefill.pluginKey
    if (prefill.version) values.version = prefill.version
    if (prefill.category) values.category = prefill.category
    if (prefill.description) values.description = prefill.description
    if (prefill.icon) values.icon = prefill.icon
    if (prefill.permissions) values.permissions = prefill.permissions
    if (prefill.tags) {
        values.tags = prefill.tags.map((text, index) => ({ id: 'tag-' + index, text }))
    }
    return values
}

export const PluginPublisherHost: React.FC = () => {
    const [request, setRequest] = React.useState<PublisherRequest | undefined>()

    React.useEffect(() => subscribePublisherRequests(setRequest), [])

    // Mount the publisher only while a request is active. Keeping it mounted
    // (with open=false) made Vite Fast Refresh preserve stale hook state when
    // the wizard's hooks changed, which crashed React with "Should have a
    // queue"; a fresh mount per request avoids that entirely.
    if (!request) return null
    const close = () => setRequest(undefined)

    // A request with a pluginId publishes a new version; otherwise the wizard
    // submits a brand-new plugin for review.
    if (request.pluginId !== undefined && request.pluginId !== null) {
        return (
            <PluginVersionPublisher
                key={'version-' + String(request.pluginId)}
                open
                onOpenChange={(next) => {
                    if (!next) close()
                }}
                pluginId={request.pluginId}
                initialArtifact={request.artifact}
                onPublished={close}
            />
        )
    }

    return (
        <PluginUploader
            key="wizard"
            open
            onOpenChange={(next) => {
                if (!next) close()
            }}
            initialValues={toInitialValues(request.prefill)}
            initialArtifact={request.artifact}
        />
    )
}
