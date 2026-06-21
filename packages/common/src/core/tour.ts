/**
 * Tour types — generic onboarding/feature-tour definitions.
 *
 * Both the core app and any plugin can contribute tours. A plugin contributes
 * tours the same way it contributes `settings`/`menus`: by passing `tours` in
 * its PluginConfig. The PluginManager aggregates them via `resolveTours()`,
 * and the TourRegistry tracks per-step completion progress.
 */

/** A single step in a tour. */
export interface TourStepConfig {
    /** Unique within the tour. Used as the key for per-step progress. */
    id: string
    /**
     * The element to spotlight. Either a CSS selector (preferred: a stable
     * `[data-tour="..."]` anchor) or a function returning the element at runtime.
     */
    target: string | (() => Element | null)
    title: string
    description: string
    /** Tooltip placement relative to the target. Defaults to 'auto'. */
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
    /** Extra px of breathing room around the spotlight hole. Defaults to 8. */
    spotlightPadding?: number
    /** Allow clicks to pass through to the highlighted element. Defaults to false. */
    allowInteraction?: boolean
    /** Navigate to this route before showing the step (e.g. '/'). */
    route?: string
    /** Runs before the step is shown — e.g. expand a collapsed menu. */
    beforeStep?: () => void | Promise<void>
    /** Custom label for the "next" button. */
    actionText?: string
}

/** A named, ordered collection of steps. */
export interface TourConfig {
    /** Globally unique tour id. Duplicate ids are de-duplicated (first wins). */
    id: string
    name: string
    steps: TourStepConfig[]
    /**
     * 'auto' tours start automatically on first run (highest-priority first).
     * 'manual' tours only start via `event.emit(START_TOUR, id)`. Defaults to 'manual'.
     */
    trigger?: 'auto' | 'manual'
    /** Ordering among auto tours; higher runs first. Defaults to 0. */
    priority?: number
    /** Bump to re-show a previously completed tour after its content changes. */
    version?: number
}
