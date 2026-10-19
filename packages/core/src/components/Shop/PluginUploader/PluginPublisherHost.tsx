/**
 * Host-side publisher: renders the real publish wizard when a plugin asks for
 * it through the pluginMarketplace service.
 *
 * The publish UI lives here in @kn/core; plugins only call
 * `pluginMarketplace.openPublisher(...)` from @kn/common, so they never import
 * core.
 */
import React from 'react'
import { useTranslation } from '@kn/common'
import type { PluginPublisherPrefill } from '@kn/common'

import {
    subscribeDeveloperVerificationRequests,
    subscribePublisherRequests,
    type PublisherRequest,
} from '../../../services/plugin-marketplace'
import { useDeveloperProfile } from '../../Developer/developer-api'
import { DeveloperVerificationDialog } from '../../Developer/DeveloperVerificationDialog'
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
    const [verificationRequested, setVerificationRequested] = React.useState(false)
    const { t } = useTranslation()
    // A request can arrive from the plugin studio (or any plugin) without the
    // wizard having been opened through the gated trigger; gate it here too.
    // The profile is only fetched once a request actually arrives, so mounting
    // this host globally costs nothing for ordinary users.
    const { verified } = useDeveloperProfile(Boolean(request) || verificationRequested)

    React.useEffect(() => subscribePublisherRequests(setRequest), [])
    React.useEffect(
        () => subscribeDeveloperVerificationRequests(() => setVerificationRequested(true)),
        [],
    )

    // A plugin (the studio) can ask for the verification dialog directly,
    // before it has anything to publish.
    if (verificationRequested) {
        return (
            <DeveloperVerificationDialog
                open
                onOpenChange={(next) => {
                    if (!next) setVerificationRequested(false)
                }}
            />
        )
    }

    // Mount the publisher only while a request is active. Keeping it mounted
    // (with open=false) made Vite Fast Refresh preserve stale hook state when
    // the wizard's hooks changed, which crashed React with "Should have a
    // queue"; a fresh mount per request avoids that entirely.
    if (!request) return null
    const close = () => setRequest(undefined)

    if (!verified) {
        return (
            <DeveloperVerificationDialog
                open
                onOpenChange={(next) => {
                    if (!next) close()
                }}
                reason={t('pluginHub.publish')}
            />
        )
    }

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
                // A caller that already uploaded an icon (the studio generates
                // one) offers it as this version's icon, so升版 can rebrand.
                initialIcon={request.prefill?.icon ?? undefined}
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
