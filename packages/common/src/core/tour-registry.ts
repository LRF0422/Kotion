/**
 * Tour Registry — holds tour definitions and tracks per-step completion
 * progress with persistence.
 *
 * Mirrors the SkillRegistry pattern (StorageAdapter + subscribe/notify).
 * Progress is stored per step so a tour can resume from where the user left
 * off and individual steps can be replayed.
 */

import type { TourConfig } from './tour'

/** Per-tour progress record. */
export interface TourProgressEntry {
    completed: boolean
    completedSteps: string[]
    dismissedAt?: string
    /** The TourConfig.version this progress was recorded against. */
    version?: number
}

export type TourProgress = Record<string, TourProgressEntry>

const STORAGE_KEY = 'kn_tour_progress'
/** Legacy flag from the old Welcome flow; migrated to the welcome tour. */
const LEGACY_WELCOME_KEY = 'hasCompletedWelcome'
/** Id of the built-in welcome tour the legacy flag maps onto. */
export const WELCOME_TOUR_ID = 'welcome'

// ---- Storage adapters -------------------------------------------------------

export interface TourStorageAdapter {
    load(): Promise<TourProgress>
    save(progress: TourProgress): Promise<void>
    clear(): Promise<void>
}

/** localStorage adapter (desktop/browser). */
export class LocalTourStorage implements TourStorageAdapter {
    private storageKey: string

    constructor(storageKey: string = STORAGE_KEY) {
        this.storageKey = storageKey
    }

    async load(): Promise<TourProgress> {
        try {
            const data = localStorage.getItem(this.storageKey)
            return data ? JSON.parse(data) : {}
        } catch (error) {
            console.error('Failed to load tour progress from local storage:', error)
            return {}
        }
    }

    async save(progress: TourProgress): Promise<void> {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(progress))
        } catch (error) {
            console.error('Failed to save tour progress to local storage:', error)
        }
    }

    async clear(): Promise<void> {
        localStorage.removeItem(this.storageKey)
    }
}

/**
 * Hybrid adapter — placeholder for account-following persistence.
 * Currently delegates to local storage; an API layer can be added later
 * without touching callers.
 */
export class HybridTourStorage implements TourStorageAdapter {
    private local: LocalTourStorage

    constructor() {
        this.local = new LocalTourStorage()
    }

    async load(): Promise<TourProgress> {
        return this.local.load()
    }

    async save(progress: TourProgress): Promise<void> {
        return this.local.save(progress)
    }

    async clear(): Promise<void> {
        return this.local.clear()
    }
}

// ---- Registry ---------------------------------------------------------------

export class TourRegistry {
    private storage: TourStorageAdapter
    private tours: Map<string, TourConfig> = new Map()
    private progress: TourProgress = {}
    private listeners: Set<() => void> = new Set()
    private initialized: boolean = false

    constructor(storage: TourStorageAdapter) {
        this.storage = storage
    }

    /** Load progress from storage and migrate the legacy welcome flag. */
    async initialize(): Promise<void> {
        if (this.initialized) return
        this.progress = await this.storage.load()
        await this.migrateLegacy()
        this.initialized = true
    }

    private async migrateLegacy(): Promise<void> {
        try {
            if (localStorage.getItem(LEGACY_WELCOME_KEY) === 'true' && !this.progress[WELCOME_TOUR_ID]) {
                this.progress[WELCOME_TOUR_ID] = { completed: true, completedSteps: [] }
                localStorage.removeItem(LEGACY_WELCOME_KEY)
                await this.storage.save(this.progress)
            }
        } catch {
            // ignore migration failures
        }
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    private notify(): void {
        this.listeners.forEach(fn => fn())
    }

    private async persist(): Promise<void> {
        await this.storage.save(this.progress)
        this.notify()
    }

    // ---- Definitions ----

    /** Register tour definitions (idempotent by id; last registration wins). */
    register(tours: TourConfig[]): void {
        let changed = false
        for (const tour of tours) {
            if (!tour?.id) continue
            this.tours.set(tour.id, tour)
            changed = true
        }
        if (changed) this.notify()
    }

    getTours(): TourConfig[] {
        return Array.from(this.tours.values())
    }

    getTour(tourId: string): TourConfig | undefined {
        return this.tours.get(tourId)
    }

    // ---- Progress ----

    private entry(tourId: string): TourProgressEntry {
        if (!this.progress[tourId]) {
            this.progress[tourId] = { completed: false, completedSteps: [] }
        }
        return this.progress[tourId]
    }

    async markStepDone(tourId: string, stepId: string): Promise<void> {
        const e = this.entry(tourId)
        if (!e.completedSteps.includes(stepId)) {
            e.completedSteps.push(stepId)
            await this.persist()
        }
    }

    async complete(tourId: string): Promise<void> {
        const e = this.entry(tourId)
        e.completed = true
        e.version = this.tours.get(tourId)?.version
        await this.persist()
    }

    async dismiss(tourId: string): Promise<void> {
        const e = this.entry(tourId)
        e.dismissedAt = new Date().toISOString()
        await this.persist()
    }

    /** Reset one tour, or all tours when no id is given. */
    async reset(tourId?: string): Promise<void> {
        if (tourId) {
            delete this.progress[tourId]
        } else {
            this.progress = {}
        }
        await this.persist()
    }

    isCompleted(tourId: string): boolean {
        const e = this.progress[tourId]
        if (!e?.completed) return false
        // Re-show if the tour's content version moved past the recorded one.
        const current = this.tours.get(tourId)?.version
        if (current != null && e.version != null && current > e.version) return false
        return true
    }

    /** Steps already completed for a tour (for resume). */
    getCompletedSteps(tourId: string): string[] {
        return this.progress[tourId]?.completedSteps ?? []
    }

    /**
     * The next auto tour to run: trigger==='auto', not completed, not dismissed,
     * highest priority first.
     */
    getNextAutoTour(): TourConfig | undefined {
        return this.getTours()
            .filter(t => (t.trigger ?? 'manual') === 'auto')
            .filter(t => !this.isCompleted(t.id))
            .filter(t => !this.progress[t.id]?.dismissedAt)
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]
    }
}

/** Create a registry with the appropriate storage for the environment. */
export function createTourRegistry(options?: { forceLocal?: boolean }): TourRegistry {
    const isDesktop = typeof window !== 'undefined' && (window as any).__ELECTRON__ !== undefined
    const storage: TourStorageAdapter =
        options?.forceLocal || isDesktop ? new LocalTourStorage() : new HybridTourStorage()
    return new TourRegistry(storage)
}
