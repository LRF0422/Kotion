import { useSyncExternalStore } from 'react'

export const MODEL_PREFERENCE_STORAGE_KEY = 'kn_chat_model'

type Listener = () => void

const listeners = new Set<Listener>()

const readStoredModel = (): string => {
    if (typeof window === 'undefined') return ''
    try {
        return window.localStorage.getItem(MODEL_PREFERENCE_STORAGE_KEY) || ''
    } catch {
        return ''
    }
}

let currentModel = readStoredModel()
let storageListenerAttached = false

const emitChange = () => {
    for (const listener of listeners) listener()
}

const attachStorageListener = () => {
    if (storageListenerAttached || typeof window === 'undefined') return
    storageListenerAttached = true
    window.addEventListener('storage', (event) => {
        if (event.key !== MODEL_PREFERENCE_STORAGE_KEY) return
        const nextModel = event.newValue || ''
        if (nextModel === currentModel) return
        currentModel = nextModel
        emitChange()
    })
}

const subscribe = (listener: Listener) => {
    attachStorageListener()
    listeners.add(listener)
    return () => listeners.delete(listener)
}

export const getModelPreference = (): string => currentModel

export const setModelPreference = (model: string) => {
    const changed = model !== currentModel
    currentModel = model
    try {
        if (model) {
            window.localStorage.setItem(MODEL_PREFERENCE_STORAGE_KEY, model)
        } else {
            window.localStorage.removeItem(MODEL_PREFERENCE_STORAGE_KEY)
        }
    } catch {
        /* Keep the in-memory preference when storage is unavailable. */
    }
    if (changed) emitChange()
}

export const useModelPreference = (): readonly [string, (model: string) => void] => {
    const model = useSyncExternalStore(subscribe, getModelPreference, () => '')
    return [model, setModelPreference] as const
}
