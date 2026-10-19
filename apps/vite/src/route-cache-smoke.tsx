import React, { useEffect, useState, useSyncExternalStore } from "react"
import { createRoot } from "react-dom/client"
// `@kn/common` is not a dependency of this app (only @kn/core is), so the smoke
// entry reaches into the workspace package the same way the other smoke pages do.
import { createBrowserRouter, RouterProvider, useLocation, useNavigate, useRouteCacheActive } from "../../../packages/common/src/index"
import "@kn/ui/globals.css"
import { RouteCacheOutlet } from "../../../packages/core/src/routing/RouteCacheOutlet"

/**
 * Manual smoke page for the shell's route cache (keep-alive). Open
 * `/route-cache-smoke.html` with `pnpm app:dev`.
 *
 * What to verify:
 *  1. Type into A's input / bump its counter / scroll its list, visit B, come
 *     back to A — input, counter and scroll are all still there.
 *  2. The status bar lists every *mounted* page. After leaving A it stays
 *     mounted and marked "background" — that is the keep-alive contract.
 *  3. Its "ticks" keep counting while backgrounded (state/effects stay alive),
 *     which is exactly why document/window listeners must be gated with
 *     `useRouteCacheActive()` (press `g`: only the visible page's counter moves).
 *  4. Visit more than 5 pages: the least recently visible background page is
 *     unmounted (LRU limit, mobile limit is 3). Come back to it and its state is
 *     reset — that page was evicted, not broken.
 *  5. The background layers are `inert`/`visibility: hidden`: tab focus never
 *     lands in a page you cannot see, and clicking where a background page used
 *     to be does nothing.
 */

interface PageStatus {
    pageId: string
    mounts: number
    ticks: number
    active: boolean
}

const pageStatus = new Map<string, PageStatus>()
const storeListeners = new Set<() => void>()
let snapshot: PageStatus[] = []

const publish = () => {
    snapshot = Array.from(pageStatus.values())
    storeListeners.forEach(listener => listener())
}

const subscribeStore = (listener: () => void) => {
    storeListeners.add(listener)
    return () => { storeListeners.delete(listener) }
}

const getSnapshot = () => snapshot
const getServerSnapshot = () => snapshot

const registerPage = (pageId: string) => {
    const existing = pageStatus.get(pageId)
    pageStatus.set(pageId, {
        pageId,
        mounts: (existing?.mounts ?? 0) + 1,
        ticks: existing?.ticks ?? 0,
        active: true,
    })
    publish()
}

const unregisterPage = (pageId: string) => {
    const existing = pageStatus.get(pageId)
    if (existing) pageStatus.set(pageId, { ...existing, mounts: Math.max(0, existing.mounts - 1) })
    publish()
}

const setPageActive = (pageId: string, active: boolean) => {
    const existing = pageStatus.get(pageId)
    if (!existing || existing.active === active) return
    pageStatus.set(pageId, { ...existing, active })
    publish()
}

const tickPage = (pageId: string) => {
    const existing = pageStatus.get(pageId)
    if (!existing) return
    pageStatus.set(pageId, { ...existing, ticks: existing.ticks + 1 })
    publish()
}

const SmokePage: React.FC<{ pageId: string; accent: string }> = ({ pageId, accent }) => {
    const active = useRouteCacheActive()
    const [count, setCount] = useState(0)
    const [text, setText] = useState("")
    const [mountCount, setMountCount] = useState(0)

    useEffect(() => {
        // State, not a ref: a fresh mount must display "1" even before any other
        // interaction, which is exactly what the smoke check asserts.
        setMountCount(value => value + 1)
        registerPage(pageId)
        return () => unregisterPage(pageId)
    }, [pageId])

    useEffect(() => {
        setPageActive(pageId, active)
    }, [pageId, active])

    // Deliberately un-gated: proves a backgrounded page keeps running effects
    // (and therefore that un-gated listeners/timers are a page-side bug).
    useEffect(() => {
        const timer = setInterval(() => tickPage(pageId), 1000)
        return () => clearInterval(timer)
    }, [pageId])

    // The documented pattern: global listeners only while the route is visible.
    useEffect(() => {
        if (!active) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() === "g") setCount(value => value + 1)
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [active])

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-6" style={{ borderTop: `4px solid ${accent}` }}>
            <header className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-semibold">页面 {pageId}</h1>
                <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"}`}>
                    {active ? "可见（active）" : "后台保活中（缓存挂载）"}
                </span>
                <span className="text-xs text-muted-foreground">挂载次数 {mountCount}</span>
            </header>

            <div className="flex flex-wrap items-center gap-3">
                <button className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" onClick={() => setCount(value => value + 1)}>
                    计数器：{count}
                </button>
                <span className="text-xs text-muted-foreground">在可见状态下按 <kbd className="rounded border px-1">g</kbd> 也能 +1（监听器只在可见时挂载）</span>
            </div>

            <input
                className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="在这里输入，切走再回来内容应该还在"
                value={text}
                onChange={event => setText(event.target.value)}
            />

            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                <div className="p-3 text-xs text-muted-foreground">滚动这个列表，切走再回来，滚动位置应该还在。</div>
                {Array.from({ length: 60 }, (_, index) => (
                    <div key={index} className="border-t px-3 py-2 text-sm">
                        第 {index + 1} 行 — {pageId} 的数据（切走后 DOM 没有卸载，滚动位置保留）
                    </div>
                ))}
            </div>
        </div>
    )
}

const PAGE_IDS = ["A", "B", "C", "D", "E", "F"]
const ACCENTS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"]

const Shell: React.FC = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const pages = useSyncExternalStore(subscribeStore, getSnapshot, getServerSnapshot)
    const mountedCount = pages.filter(page => page.mounts > 0).length

    return (
        <div className="flex h-full flex-col">
            <div className="border-b bg-muted/40 px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                    {PAGE_IDS.map(pageId => (
                        <button
                            key={pageId}
                            className={`rounded-md border px-3 py-1.5 text-sm ${location.pathname === `/smoke/${pageId}` ? "bg-primary text-primary-foreground" : "bg-background"}`}
                            onClick={() => navigate(`/smoke/${pageId}`)}
                        >
                            {pageId}
                        </button>
                    ))}
                    <span className="ml-2 text-xs text-muted-foreground">
                        已挂载 {mountedCount} 个页面（LRU 上限：桌面 5 / 移动端 3）
                    </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {pages.filter(page => page.mounts > 0).map(page => (
                        <span key={page.pageId} className={`rounded border px-2 py-1 ${page.active ? "border-emerald-500/40 text-emerald-500" : "border-amber-500/40 text-amber-500"}`}>
                            {page.pageId}: {page.active ? "可见" : "后台"} · ticks {page.ticks} · mounts {page.mounts}
                        </span>
                    ))}
                </div>
            </div>
            <div className="min-h-0 flex-1">
                <RouteCacheOutlet />
            </div>
        </div>
    )
}

const pageRoute = (pageId: string, index: number) => ({
    path: `/smoke/${pageId}`,
    element: <SmokePage pageId={pageId} accent={ACCENTS[index]} />,
    // The real app attaches this from `reslove` (route pattern + keepAlive);
    // this smoke builds its own tiny router, so it declares it directly.
    handle: { routeCache: { pattern: `/smoke/${pageId}` } },
})

// The entry is served as /route-cache-smoke.html; the smoke router lives at "/",
// so normalize the URL before the router reads its initial location.
if (!window.location.pathname.startsWith("/smoke/")) {
    window.history.replaceState(null, "", "/")
}

const router = createBrowserRouter([
    {
        path: "/",
        element: <Shell />,
        children: [
            { path: "/", element: <div className="p-6 text-sm text-muted-foreground">选择上面的页面开始验证。</div> },
            ...PAGE_IDS.map((pageId, index) => pageRoute(pageId, index)),
        ],
    },
])

window.addEventListener("error", event => { document.body.dataset.error = event.message })

// No <StrictMode>: the smoke verifies "mounts once and stays mounted", and
// StrictMode's deliberate double-mounting in dev would muddy exactly that signal.
createRoot(document.getElementById("root")!).render(
    <RouterProvider router={router} />,
)
