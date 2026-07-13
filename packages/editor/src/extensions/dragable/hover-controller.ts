import React from 'react'
import { createRoot, Root } from 'react-dom/client'
import { Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import { findParentNodeClosestToPos } from 'prosemirror-utils'

import type { DragableStorage, DragSharedState } from './dragable'
import { DragHandle } from './block-menu'
import { liftToReactRenderer, resolveDraggableBlock } from './dom-utils'
import type { DragSourceHandlers } from './drag-source'

/** How long to wait after the pointer leaves the container before hiding. */
const CONTAINER_LEAVE_DELAY = 300
/** How long to wait after the pointer leaves the entire editor. */
const EDITOR_LEAVE_DELAY = 400

/** Fallback width (px) used until the container has been measured once. */
const DEFAULT_CONTAINER_WIDTH = 38

export interface HoverController {
    /** DOM node hosting the block menu — attached to `view.dom.parentNode` on `attach`. */
    containerDOM: HTMLElement
    /** Mount the container and wire mouseenter / mouseleave listeners. */
    attach: (view: EditorView) => void
    /** Full teardown — cancels rAF, unmounts the React tree, removes listeners. */
    detach: () => void
    /** Coalesced mousemove entry point — records coords, defers work to rAF. */
    onMouseMove: (view: EditorView, event: MouseEvent) => void
    /** Called on `keydown` — the handle should never linger while typing. */
    onKeyDown: () => void
    /** Called when the pointer leaves the editor DOM entirely. */
    onEditorMouseLeave: () => void
}

/**
 * Owns the drag-handle DOM container, the React block-menu tree, and the
 * rAF-throttled hover resolution. Reads/writes only `shared.activeNode`
 * externally — dragging state and dragged-node info are managed by the
 * drag-source and column-drop controllers.
 */
export function createHoverController(params: {
    editor: Editor
    shared: DragSharedState
    dragSource: DragSourceHandlers
}): HoverController {
    const { editor, shared, dragSource } = params

    // ── DOM structure ────────────────────────────────────────────────────
    // Single React mount that renders the whole handle UI (the "+" add button
    // and the draggable grip). Drag/click events are wired up inside React
    // via the `dragSource` callbacks.
    const container = document.createElement('div')
    container.className = 'drag-handle-container'
    const menuMount = document.createElement('div')
    menuMount.className = 'block-menu-mount'
    container.appendChild(menuMount)

    // ── React root (lazy) ────────────────────────────────────────────────
    let blockMenuRoot: Root | null = null

    // ── rAF-coalesced mousemove state ────────────────────────────────────
    //
    // mousemove is a hot event, especially on Safari where posAtCoords + two
    // getBoundingClientRect reads + a full React reconcile per event visibly
    // stutters. We record only the coords/target in the handler and defer
    // the heavy work to a single rAF pass.
    let pendingMouseX = 0
    let pendingMouseY = 0
    let pendingMouseTarget: EventTarget | null = null
    let rafId: number | null = null

    /**
     * DOM node of the block the handle is currently pinned to. Used as a
     * short-circuit key: if the pointer is still over the same block on the
     * next rAF pass, we can skip the layout reads and React reconcile.
     * Invalidated whenever the handle is hidden.
     */
    let lastHoveredBlockEl: HTMLElement | null = null

    /** Debounce for hover-leave hide (both container and editor DOM). */
    let leaveTimer: any = null

    const showHandle = () => {
        container.classList.add('show')
        container.classList.remove('hide')
    }

    const hideHandle = () => {
        // Don't hide while the "+" dropdown is open — otherwise it would
        // teleport away while the user is picking an item.
        if (container.getAttribute('data-menu-open') === 'true') return
        container.classList.remove('show')
        container.classList.remove('active')
        container.classList.add('hide')
        // Force the next mousemove to re-resolve + re-render, rather than
        // short-circuiting against a stale block reference.
        lastHoveredBlockEl = null
    }

    const renderBlockMenu = () => {
        if (!blockMenuRoot) blockMenuRoot = createRoot(menuMount)

        // `editor.storage.dragable` is replaced by callers (render.tsx /
        // collaboration.tsx) after the extension is instantiated, so we must
        // read it live rather than capturing at construction time.
        const items = (editor.storage?.dragable as DragableStorage)?.blockMenuItems || []

        blockMenuRoot.render(
            React.createElement(DragHandle, {
                editor,
                activeNode: shared.activeNode,
                items,
                onGripMouseDown: dragSource.onGripMouseDown,
                onGripMouseUp: dragSource.onGripMouseUp,
                onGripDragStart: dragSource.onGripDragStart,
            })
        )
    }

    const unmountBlockMenu = () => {
        if (blockMenuRoot) {
            blockMenuRoot.unmount()
            blockMenuRoot = null
        }
    }

    const positionHandle = (view: EditorView, referenceRectDOM: HTMLElement) => {
        const root = view.dom.parentElement
        if (!root) return

        // For a details block the resolved reference can be the inner
        // summary/content, which flexbox insets to the right of the leading
        // ▶ toggle — anchoring the handle there drops it on top of the toggle
        // (+ ▶ ⠿ ● overlap). Anchor to the outer `.details` box so the handle
        // stays in the left gutter.
        const detailsBox = referenceRectDOM.closest?.('.details') as HTMLElement | null
        const anchorDOM = detailsBox ?? referenceRectDOM

        const targetRect = anchorDOM.getBoundingClientRect()
        const rootRect = root.getBoundingClientRect()

        let offsetX = -5
        if (anchorDOM.tagName === 'LI') {
            offsetX = anchorDOM.getAttribute('data-checked') ? -3 : -16
        }

        const containerWidth = container.offsetWidth || DEFAULT_CONTAINER_WIDTH
        const left = targetRect.left - rootRect.left - containerWidth + offsetX
        const top = targetRect.top - rootRect.top + 8 + root.scrollTop

        container.style.left = `${left}px`
        container.style.top = `${top - 2}px`
        showHandle()
    }

    const onContainerMouseEnter = () => {
        if (!shared.activeNode) return
        if (leaveTimer != null) {
            clearTimeout(leaveTimer)
            leaveTimer = null
        }
        showHandle()
    }

    const onContainerMouseLeave = () => {
        if (!shared.activeNode) return
        if (leaveTimer != null) clearTimeout(leaveTimer)
        leaveTimer = setTimeout(hideHandle, CONTAINER_LEAVE_DELAY)
    }

    /**
     * Actual hover resolution — runs at most once per animation frame from
     * `onMouseMove`. Short-circuits when the pointer is still over the same
     * block, avoiding a full React reconcile of the block menu and a
     * layout-forcing getBoundingClientRect pair per event.
     */
    const processHover = (view: EditorView) => {
        if (!view.editable) return
        if (container.getAttribute('data-menu-open') === 'true') return

        const pos = view.posAtCoords({ left: pendingMouseX, top: pendingMouseY })
        const target = pendingMouseTarget
        pendingMouseTarget = null
        if (!pos || !pos.pos) return

        // Start from the ProseMirror-preferred DOM if any, falling back to
        // the raw event target. Text nodes are walked to their parent.
        let dom: HTMLElement | null =
            (view.nodeDOM(pos.pos) as HTMLElement | null) ||
            (view.domAtPos(pos.pos)?.node as HTMLElement | null) ||
            (target as HTMLElement | null)

        if (!dom) {
            if (shared.dragging) return
            hideHandle()
            return
        }
        while (dom && dom.nodeType === 3) dom = dom.parentElement

        // For list rows, walk up to the enclosing <li>.
        const maybeListItem = findParentNodeClosestToPos(view.state.doc.resolve(pos.pos), (node) =>
            node.type.name === 'taskItem' || node.type.name === 'listItem'
        )
        if (maybeListItem) {
            while (dom && dom.tagName !== 'LI') dom = dom.parentElement
        }
        if (!dom) {
            if (shared.dragging) return
            hideHandle()
            return
        }

        // Single-item list → skip (parent block owns the handle instead).
        if (dom.tagName === 'LI' && dom.parentElement?.childElementCount === 1) return
        // Don't offer to drag the whole list — grip individual items instead.
        if (dom.tagName === 'UL' || dom.tagName === 'OL') return

        const blockDOM = liftToReactRenderer(dom) ?? dom
        if (!(blockDOM instanceof Element)) {
            if (shared.dragging) return
            hideHandle()
            return
        }

        const result = resolveDraggableBlock(blockDOM as HTMLElement, view)
        if (!result) {
            if (shared.dragging) return
            hideHandle()
            return
        }

        // Fast path: same block as the previous frame. Position + React tree
        // are already correct; we only need to make sure the container is
        // visible in case a prior hide() was queued.
        if (shared.activeNode && result.el === lastHoveredBlockEl) {
            showHandle()
            return
        }

        shared.activeNode = result
        lastHoveredBlockEl = result.el
        positionHandle(view, result.el)
        renderBlockMenu()
    }

    return {
        containerDOM: container,

        attach: (view) => {
            // Hover show/hide on the container only (not individual children).
            // Grip drag/click events are wired inside the React DragHandle
            // (see `renderBlockMenu`).
            container.addEventListener('mouseenter', onContainerMouseEnter)
            container.addEventListener('mouseleave', onContainerMouseLeave)
            view.dom.parentNode?.appendChild(container)
            // NOTE: this overwrites all existing inline styles on the parent.
            // Kept for backward compatibility with existing CSS positioning.
            view.dom.parentElement?.setAttribute('style', 'position: relative;')
        },

        detach: () => {
            if (leaveTimer != null) {
                clearTimeout(leaveTimer)
                leaveTimer = null
            }
            if (rafId != null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            pendingMouseTarget = null
            lastHoveredBlockEl = null
            unmountBlockMenu()
            container.removeEventListener('mouseenter', onContainerMouseEnter)
            container.removeEventListener('mouseleave', onContainerMouseLeave)
            container.remove()
        },

        onMouseMove: (view, event) => {
            if (!view.editable) return
            if (container.getAttribute('data-menu-open') === 'true') return
            pendingMouseX = event.clientX
            pendingMouseY = event.clientY
            pendingMouseTarget = event.target
            if (rafId == null) {
                rafId = requestAnimationFrame(() => {
                    rafId = null
                    processHover(view)
                })
            }
        },

        onKeyDown: () => hideHandle(),

        onEditorMouseLeave: () => {
            if (leaveTimer != null) clearTimeout(leaveTimer)
            leaveTimer = setTimeout(hideHandle, EDITOR_LEAVE_DELAY)
        },
    }
}
