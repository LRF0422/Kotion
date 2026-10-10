/**
 * Hot-reloadable plugin components — a stable identity for changing code.
 *
 * ## The problem
 *
 * The plugin studio "hot reloads" a project by building a new bundle and
 * activating it. Activation produces a *new* `KPlugin` instance whose config
 * holds *new* component functions: `dockPanels[0].component` is a different
 * function after every build. React identifies a component by that function, so
 * a new one means "a different component": the old subtree is unmounted and a
 * fresh one is mounted. Every hook state, scroll position and open dialog in
 * the developer's panel dies on every save — the reload is a restart.
 *
 * ## The fix
 *
 * Hand React a *stable* function and move the changing implementation behind
 * it. The host renders the wrapper; the wrapper calls whatever implementation
 * the slot currently holds:
 *
 * ```
 * HotComponentBoundary   ← error boundary (identity: one per slot)
 *   └─ SlotHost(props)   ← identity: one per slot, never replaced
 *        └─ slot.current(props)   ← the implementation, swapped per reload
 * ```
 *
 * Calling the implementation **inline** (rather than through
 * `React.createElement`) is the whole trick: its hooks are recorded on
 * `SlotHost`'s fiber, and that fiber is the one React keeps. Swap
 * `slot.current` and the next render runs the new code against the state the
 * old code left behind — the same idea as React Fast Refresh, without needing a
 * bundler transform or React's dev-only internals.
 *
 * Two consequences worth stating plainly:
 *
 * - **The hook shape must stay compatible.** React keeps a hook *list*; adding
 *   or removing a hook across a reload either misaligns the state or makes
 *   React throw. A throw is handled: the boundary remounts the component once
 *   (fresh state, exactly what Fast Refresh does when the signature changes)
 *   instead of leaving the panel crashed.
 * - **Non-function components do not get their state preserved.** A class
 *   component, `React.memo(...)` or `forwardRef(...)` is rendered through
 *   `createElement`, so its instance is recreated on reload. It still updates
 *   and still cannot take the host down; it just remounts.
 */

import React from 'react'

/** Anything the host may render as a contribution. */
export type HotRenderable = React.ComponentType<any>

interface HotSlot {
    /** Contribution-local key, e.g. `dockPanel:outline`. */
    readonly slotKey: string
    /** The newest implementation; replaced by every hot reload. */
    current: unknown
    /** The identity handed to React. Created once, never replaced. */
    wrapper: HotRenderable
    /**
     * The function whose fiber React keeps, and therefore whose hooks survive a
     * reload. Created once, never replaced; it calls `current` inline.
     */
    host: (props: Record<string, unknown>) => React.ReactNode
    /** How many implementations this identity has carried (0 = original). */
    generation: number
}

/** One stable identity, for diagnostics and tests. */
export interface HotComponentStats {
    pluginKey: string
    slotKey: string
    generation: number
}

/**
 * React's own error text when a reload changed a component's hook shape.
 *
 * Adding a hook makes React run out of the hooks it recorded for the previous
 * implementation; that is the signal to remount rather than report a bug.
 */
const HOOK_SHAPE_ERROR = /more hooks than during the previous render|rendered fewer hooks than expected|change in the order of Hooks/i

/**
 * Is this React's "the hook shape changed" error?
 *
 * Adding a hook makes React run out of the hooks it recorded for the previous
 * implementation; that is the signal to remount rather than report a bug.
 * Exported because it is the trigger for the boundary's auto-remount, and
 * because it must be matched against React's real wording.
 */
export const isHookShapeError = (error: unknown): boolean =>
    HOOK_SHAPE_ERROR.test(error instanceof Error ? error.message : String(error ?? ''))

/** What a boundary does with a render error. */
export type HotBoundaryAction = 'remount' | 'report'

/**
 * The boundary's reaction to a failed render.
 *
 * A hook-shape change is the one failure a reload *causes* and can recover from:
 * remount the slot (fresh hook list, fresh state — what React Fast Refresh does
 * when a component's signature changes). Exactly once, so a component that
 * throws on every render still ends up as the error card instead of a loop.
 */
export const hotBoundaryAction = (
    state: { autoRemounts: number },
    error: unknown,
): HotBoundaryAction =>
    isHookShapeError(error) && state.autoRemounts < 1 ? 'remount' : 'report'

/** Class components must be instantiated by React, not called as a function. */
const isClassComponent = (value: unknown): boolean =>
    typeof value === 'function'
    && Boolean((value as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent)

/**
 * Can this be a component at all?
 *
 * A function, or one of React's exotic component objects (`memo`, `forwardRef`,
 * `lazy` — all carry `$$typeof`). Anything else (a string tag, a random object)
 * is passed through untouched so React reports it exactly as it did before there
 * was a wrapper in the way, instead of the wrapper quietly rendering it as a
 * host element.
 */
const isWrappableComponent = (value: unknown): boolean =>
    typeof value === 'function'
    || (typeof value === 'object' && value !== null && '$$typeof' in value)

interface ErrorCardProps {
    label: string
    error: unknown
    onRetry: () => void
}

/**
 * What a crashed plugin component renders as.
 *
 * Visible on purpose: a panel that silently disappears is indistinguishable
 * from a panel that failed to register, and this boundary exists to make plugin
 * failures legible instead of fatal.
 *
 * Deliberately i18n-free and dependency-free, with bilingual labels instead of
 * translated ones: this module sits in `PluginManager`'s import graph, so
 * anything it imports is imported by every host that renders a plugin
 * component. (Adding `react-i18next` here broke an esbuild consumer — that is
 * how the rule got written down.)
 */
const HotComponentError: React.FC<ErrorCardProps> = ({ label, error, onRetry }) => {
    const message = error instanceof Error ? error.message : String(error ?? '')
    return (
        <div
            className="flex h-full min-h-0 flex-col gap-2 overflow-auto p-3 text-xs"
            data-kn-hot-error={label}
        >
            <p className="font-medium text-destructive">
                插件组件出错 · Plugin component failed
            </p>
            <p className="break-all text-muted-foreground">{label}</p>
            <pre className="whitespace-pre-wrap break-words rounded bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {message}
            </pre>
            <button
                type="button"
                onClick={onRetry}
                className="self-start rounded border px-2 py-1 font-medium hover:bg-muted"
            >
                重试 · Retry
            </button>
        </div>
    )
}

/**
 * Build the stable wrapper for one slot.
 *
 * `label` is only for error messages and React DevTools.
 */
const createWrapper = (slot: HotSlot, label: string): HotRenderable => {
    const SlotHost = (props: Record<string, unknown>): React.ReactNode => {
        const implementation = slot.current
        if (implementation === null || implementation === undefined) return null
        // Function components are called inline so their hooks belong to THIS
        // fiber (see the file header); everything else goes through React.
        if (typeof implementation === 'function' && !isClassComponent(implementation)) {
            return (implementation as (props: Record<string, unknown>) => React.ReactNode)(props)
        }
        return React.createElement(implementation as HotRenderable, props)
    }
    SlotHost.displayName = `KnHotComponent(${label})`
    slot.host = SlotHost

    interface BoundaryState {
        error: unknown
        /** Bumped to remount the slot subtree (a new React key). */
        attempt: number
        /** Auto remounts used for hook-shape changes. */
        autoRemounts: number
    }

    /**
     * Per-slot error boundary, and the reason a crashed plugin can no longer
     * take the host down: dock panels and settings renderers are mounted by the
     * app shell, which does not wrap contributions in a boundary of its own.
     */
    class HotComponentBoundary extends React.Component<Record<string, unknown>, BoundaryState> {
        state: BoundaryState = { error: null, attempt: 0, autoRemounts: 0 }

        static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
            return { error }
        }

        componentDidCatch(error: unknown): void {
            if (hotBoundaryAction(this.state, error) === 'remount') {
                console.warn(`[plugin] ${label}: hook shape changed across a reload; remounting`, error)
                this.setState(previous => ({
                    error: null,
                    attempt: previous.attempt + 1,
                    autoRemounts: previous.autoRemounts + 1,
                }))
                return
            }
            console.warn(`[plugin] ${label} failed to render:`, error)
        }

        render(): React.ReactNode {
            if (this.state.error) {
                return (
                    <HotComponentError
                        label={label}
                        error={this.state.error}
                        onRetry={() => this.setState(previous => ({
                            error: null,
                            attempt: previous.attempt + 1,
                        }))}
                    />
                )
            }
            // A new key is a new fiber: after a hook-shape error the slot must
            // start from a clean hook list, not from the one React rejected.
            return React.createElement(SlotHost as HotRenderable, {
                ...(this.props as Record<string, unknown>),
                key: this.state.attempt,
            })
        }
    }
    // Named for React DevTools; `displayName` is not part of the class type.
    ;(HotComponentBoundary as unknown as { displayName?: string }).displayName =
        `KnHotComponentBoundary(${label})`

    return HotComponentBoundary
}

/**
 * The host's slots, keyed by plugin registry key.
 *
 * Keyed by `pluginKey` (the manifest's stable registry key) rather than by the
 * runtime plugin name, so editing `displayName` between builds keeps the
 * identity — the panel does not remount just because its title changed.
 *
 * One registry per `PluginManager`: a plugin is a runtime concept, and an
 * uninstall must drop its identities so that installing it again mounts fresh.
 */
export class HotComponentRegistry {
    private _slots = new Map<string, Map<string, HotSlot>>()

    /**
     * The stable identity for one contribution slot, now rendering `component`.
     *
     * Called by the manager's `resolve*` methods on every cache rebuild. The
     * first call creates the identity; later calls repoint it, which is what
     * makes a hot reload visible without remounting.
     */
    resolve(pluginKey: string, slotKey: string, component: unknown): unknown {
        if (!isWrappableComponent(component)) return component

        let slots = this._slots.get(pluginKey)
        if (!slots) {
            slots = new Map()
            this._slots.set(pluginKey, slots)
        }

        const existing = slots.get(slotKey)
        if (existing) {
            // Re-resolving with the same function is the normal case (any plugin
            // change rebuilds the resolve caches); only a *new* implementation is
            // a reload, and only that bumps the generation.
            if (existing.current !== component) {
                existing.current = component
                existing.generation += 1
            }
            return existing.wrapper
        }

        const slot: HotSlot = {
            slotKey,
            current: component,
            wrapper: undefined as unknown as HotRenderable,
            host: undefined as unknown as HotSlot['host'],
            generation: 0,
        }
        slot.wrapper = createWrapper(slot, `${pluginKey} → ${slotKey}`)
        slots.set(slotKey, slot)
        return slot.wrapper
    }

    /**
     * Forget every identity of one plugin.
     *
     * Called on uninstall: the contribution is gone, so a later install is a
     * mount, not a reload — its state should start over.
     */
    release(pluginKey: string): void {
        this._slots.delete(pluginKey)
    }

    releaseAll(): void {
        this._slots.clear()
    }

    /** Diagnostics: one entry per live identity. */
    stats(): HotComponentStats[] {
        const stats: HotComponentStats[] = []
        this._slots.forEach((slots, pluginKey) => {
            slots.forEach(slot => {
                stats.push({ pluginKey, slotKey: slot.slotKey, generation: slot.generation })
            })
        })
        return stats
    }

    /**
     * The stable host function behind one contribution — the fiber React keeps,
     * and therefore the place the implementation's hooks live.
     *
     * Diagnostics and tests: the whole mechanism reduces to "this function is the
     * same object across a reload, and it calls the newest implementation
     * inline", which is exactly what this returns.
     */
    hostOf(pluginKey: string, slotKey: string): HotSlot['host'] | undefined {
        return this._slots.get(pluginKey)?.get(slotKey)?.host
    }
}
