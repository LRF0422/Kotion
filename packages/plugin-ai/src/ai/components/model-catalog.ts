/**
 * Shared model catalog + vision-capability lookup.
 *
 * `/api/v1/models` carries `supportsVision` per model (ModelController). The
 * chat needs that capability *before* the picker is ever opened: the composer
 * has to disable image upload for a model that cannot see images, instead of
 * letting the user attach one and only learn from the answer "我看不到图片"
 * (the backend drops non-vision image parts and degrades to a text notice).
 *
 * The catalog therefore lives here as one module-level cache shared by every
 * consumer (model picker + composer): one request per page, refreshed never —
 * the model list is static for a deployment.
 */

import { useEffect, useState } from 'react'
import { fetchModels, type ModelInfo } from '@kn/common'

let cache: ModelInfo[] | null = null
let inflight: Promise<ModelInfo[]> | null = null
const listeners = new Set<() => void>()

function publish(models: ModelInfo[]): ModelInfo[] {
    cache = models
    for (const listener of listeners) listener()
    return models
}

/**
 * Load the catalog. Concurrent callers share one request.
 *
 * `force` re-fetches: the model picker uses it when it opens, so a first
 * attempt that failed (token not ready at chat mount, transient error) can
 * recover without a page reload. A failed refresh keeps the previous catalog
 * rather than downgrading every consumer to "unknown capability"; a genuinely
 * empty list is cached as-is, which is what the picker's empty state means.
 */
export function loadModelCatalog(force = false): Promise<ModelInfo[]> {
    if (!force) {
        if (cache) return Promise.resolve(cache)
        if (inflight) return inflight
    }
    inflight = fetchModels()
        .then(publish, () => (cache ? cache : publish([])))
        .then((models) => {
            inflight = null
            return models
        })
    return inflight
}

/** Catalog as state; `undefined` until the first load settles. */
export function useModelCatalog(): ModelInfo[] | undefined {
    const [models, setModels] = useState<ModelInfo[] | undefined>(() => cache ?? undefined)

    useEffect(() => {
        let active = true
        const listener = () => {
            if (active) setModels(cache ?? undefined)
        }
        listeners.add(listener)
        void loadModelCatalog()
        // Cover the case where the catalog settled between the initial state
        // and this effect running.
        listener()
        return () => {
            active = false
            listeners.delete(listener)
        }
    }, [])

    return models
}

export interface ModelVisionSupport {
    /**
     * True only when the catalog *positively* reports the capability. An
     * unresolved model — catalog not loaded yet, model absent from the list
     * (custom / unknown id), or the `''` "backend default" selection — is never
     * reported as non-vision: we must not block an upload the backend would
     * have accepted. A false negative only costs a confusing answer, while a
     * false positive would make the feature unusable.
     */
    known: boolean
    /** Meaningful only when {@link known}; false otherwise. */
    supportsVision: boolean
    /** The catalog entry the answer came from, when there was one. */
    modelInfo?: ModelInfo
}

/** Whether `model` can accept image input, per the backend catalog. */
export function useModelVisionSupport(model: string): ModelVisionSupport {
    const models = useModelCatalog()
    const modelInfo = model && models ? models.find((item) => item.id === model) : undefined
    const known = typeof modelInfo?.supportsVision === 'boolean'
    return {
        known,
        supportsVision: known ? Boolean(modelInfo?.supportsVision) : false,
        modelInfo,
    }
}
