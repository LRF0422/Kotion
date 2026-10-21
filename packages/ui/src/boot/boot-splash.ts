/**
 * Runtime control for the pre-mount boot splash declared in `./splash-source.ts`.
 *
 * The static markup is injected into `index.html` and paints before React (and
 * the plugin bundles) exist. This module is the only supported way to nudge it:
 *
 * ```ts
 * setBootPhase('plugins')   // "正在加载插件…"
 * bootSplashReady()         // finish the bar, fade out, remove
 * bootSplashDismiss()       // remove instantly (error screens provide the UI)
 * ```
 *
 * Every call is a no-op when the splash is absent (unit tests, HMR, an app shell
 * that ships its own loading UI), so callers never need to guard.
 */

export type BootPhase = 'boot' | 'plugins' | 'workspace'

const ROOT_ID = 'kn-boot'
const STAGE_ID = 'kn-boot-stage'

const STAGE_TEXT: Record<BootPhase, { zh: string; en: string }> = {
    boot: { zh: '正在启动…', en: 'Starting…' },
    plugins: { zh: '正在加载插件…', en: 'Loading plugins…' },
    workspace: { zh: '正在准备工作区…', en: 'Preparing workspace…' },
}

/** Keep the splash up at least this long so it never flashes on a fast load. */
const MIN_VISIBLE_MS = 420
/** Hold the completed bar for a beat before fading (the fill takes ~300ms). */
const DONE_HOLD_MS = 340
/** Must cover the `opacity` transition in splash-source.ts. */
const LEAVE_MS = 280

const mountedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
let finished = false

function splashRoot(): HTMLElement | null {
    if (typeof document === 'undefined') return null
    const element = document.getElementById(ROOT_ID)
    return element instanceof HTMLElement ? element : null
}

/** Update the status line the splash is showing. */
export function setBootPhase(phase: BootPhase): void {
    const root = splashRoot()
    if (!root || finished) return
    const stage = root.querySelector<HTMLElement>(`#${STAGE_ID}`)
    if (!stage) return
    root.dataset.phase = phase
    const zh = stage.querySelector<HTMLElement>('.kn-boot__stage-zh')
    const en = stage.querySelector<HTMLElement>('.kn-boot__stage-en')
    const text = STAGE_TEXT[phase]
    if (zh) zh.textContent = text.zh
    if (en) en.textContent = text.en
}

function removeSplash(root: HTMLElement): void {
    finished = true
    root.remove()
}

/**
 * Finish the progress bar and fade the splash out. Safe to call more than once
 * and before the app has mounted; the slow-loader hint and animation timers are
 * owned by CSS, so there is nothing else to tear down.
 */
export function bootSplashReady(): void {
    const root = splashRoot()
    if (!root || finished) return
    if (root.classList.contains('kn-boot--leaving')) return

    const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - mountedAt))
    root.dataset.state = 'done'
    // Let the completed bar paint before the fade starts.
    window.setTimeout(() => {
        const stillThere = splashRoot()
        if (!stillThere) return
        stillThere.classList.add('kn-boot--leaving')
        window.setTimeout(() => {
            if (stillThere.isConnected) removeSplash(stillThere)
        }, LEAVE_MS + 40)
    }, wait + DONE_HOLD_MS)
}

/** Remove the splash immediately — for error screens that render their own UI. */
export function bootSplashDismiss(): void {
    const root = splashRoot()
    if (!root) {
        finished = true
        return
    }
    removeSplash(root)
}
