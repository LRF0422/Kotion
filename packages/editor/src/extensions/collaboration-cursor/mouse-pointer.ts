import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { CollaborationCursorUser } from './collaboration-cursor';

export interface MousePointerSyncOptions {
    provider: any;
}

export const mousePointerSyncPluginKey = new PluginKey('mousePointerSync');

// Awareness type from provider (same shape used by NodeSelectionCursor)
type Awareness = {
    clientID: number;
    getStates: () => Map<number, any>;
    getLocalState: () => any;
    setLocalStateField: (field: string, value: any) => void;
    on: (event: string, listener: (...args: any[]) => void) => void;
    off: (event: string, listener: (...args: any[]) => void) => void;
};

// Minimum interval between awareness broadcasts (~25fps). Keeps the WS
// traffic bounded even though mousemove can fire far more often.
const BROADCAST_INTERVAL_MS = 40;

// A remote pointer that has not moved for this long is hidden — the user is
// probably reading, and a frozen arrow is just noise.
const POINTER_IDLE_TIMEOUT_MS = 30_000;

/** Arrow shape rendered for each remote pointer (Figma-style cursor). */
const POINTER_SVG =
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M2 1.5L13.5 7.5L8.5 8.8L6.2 13.8L2 1.5Z" fill="currentColor" stroke="white" stroke-width="1"/>' +
    '</svg>';

/**
 * Manages the DOM overlay that renders remote users' mouse pointers.
 *
 * Coordinates are exchanged relative to the ProseMirror root element, so they
 * stay correct across different window sizes and scroll positions as long as
 * both peers render the same content column. The overlay lives inside the
 * scrolled content, which keeps pointers anchored to the document while
 * scrolling.
 */
class PointerOverlay {
    private overlay: HTMLDivElement;
    private pointers = new Map<number, HTMLDivElement>();

    constructor(private view: EditorView) {
        this.overlay = document.createElement('div');
        this.overlay.className = 'collaboration-pointer-overlay';
        this.overlay.setAttribute('aria-hidden', 'true');

        const parent = this.view.dom.parentElement;
        if (parent) {
            const position = window.getComputedStyle(parent).position;
            if (position === 'static') {
                parent.style.position = 'relative';
            }
            parent.appendChild(this.overlay);
        }
    }

    /** Sync overlay children with the current awareness states. */
    update(awareness: Awareness) {
        const seen = new Set<number>();

        // Coordinates travel relative to the ProseMirror root; the overlay may
        // have a slightly different origin, so correct for the delta once.
        let dx = 0;
        let dy = 0;
        if (this.overlay.isConnected) {
            const overlayRect = this.overlay.getBoundingClientRect();
            const pmRect = this.view.dom.getBoundingClientRect();
            dx = pmRect.left - overlayRect.left;
            dy = pmRect.top - overlayRect.top;
        }

        awareness.getStates().forEach((state: any, clientId: number) => {
            if (clientId === awareness.clientID) return;

            const user = state?.user as CollaborationCursorUser | undefined;
            const pointer = state?.pointer;
            if (!user?.color || !pointer || pointer.x == null || pointer.y == null) return;
            if (pointer.ts && Date.now() - pointer.ts > POINTER_IDLE_TIMEOUT_MS) return;

            seen.add(clientId);
            let el = this.pointers.get(clientId);
            if (!el) {
                el = this.createPointerElement(user);
                this.pointers.set(clientId, el);
                this.overlay.appendChild(el);
            }
            el.style.color = user.color;
            el.style.transform = `translate(${pointer.x + dx}px, ${pointer.y + dy}px)`;
        });

        // Remove pointers for users that left or cleared their pointer state
        this.pointers.forEach((el, clientId) => {
            if (!seen.has(clientId)) {
                el.remove();
                this.pointers.delete(clientId);
            }
        });
    }

    private createPointerElement(user: CollaborationCursorUser): HTMLDivElement {
        const el = document.createElement('div');
        el.className = 'collaboration-pointer';

        const arrow = document.createElement('span');
        arrow.className = 'collaboration-pointer__arrow';
        arrow.innerHTML = POINTER_SVG;
        el.appendChild(arrow);

        const label = document.createElement('span');
        label.className = 'collaboration-pointer__label';
        label.style.backgroundColor = user.color;
        label.textContent = user.name || 'Anonymous';
        el.appendChild(label);

        return el;
    }

    destroy() {
        this.pointers.clear();
        this.overlay.remove();
    }
}

/**
 * Broadcasts the local user's mouse position over the collaboration provider's
 * awareness channel and renders remote users' pointers, Figma-style.
 *
 * Uses a dedicated 'pointer' awareness field so it never conflicts with the
 * caret ('cursor') and 'nodeSelection' fields managed by other extensions.
 */
export const MousePointerSync = Extension.create<MousePointerSyncOptions>({
    name: 'mousePointerSync',

    addOptions() {
        return {
            provider: null,
        };
    },

    addProseMirrorPlugins() {
        const { provider } = this.options;

        return [
            new Plugin({
                key: mousePointerSyncPluginKey,
                view(view) {
                    const awareness = provider?.awareness as Awareness | undefined;
                    if (!awareness) {
                        return {};
                    }

                    const overlay = new PointerOverlay(view);

                    // Track mouse over the whole scrollable editor pane (not
                    // just the content column) so the pointer follows even in
                    // the page margins.
                    const target: HTMLElement =
                        (view.dom.closest('#editor-container') as HTMLElement) ?? view.dom;

                    let rafId: number | null = null;
                    let lastBroadcast = 0;
                    let pending: { x: number; y: number } | null = null;

                    const flush = () => {
                        rafId = null;
                        if (!pending) return;
                        const now = Date.now();
                        if (now - lastBroadcast < BROADCAST_INTERVAL_MS) {
                            // Too soon — try again next frame with the latest coords
                            rafId = requestAnimationFrame(flush);
                            return;
                        }
                        lastBroadcast = now;
                        awareness.setLocalStateField('pointer', { ...pending, ts: now });
                        pending = null;
                    };

                    const onMouseMove = (event: MouseEvent) => {
                        // Coordinates relative to the ProseMirror root so peers
                        // can map them onto their own layout.
                        const rect = view.dom.getBoundingClientRect();
                        pending = {
                            x: Math.round(event.clientX - rect.left),
                            y: Math.round(event.clientY - rect.top),
                        };
                        if (rafId == null) {
                            rafId = requestAnimationFrame(flush);
                        }
                    };

                    const onMouseLeave = () => {
                        pending = null;
                        awareness.setLocalStateField('pointer', null);
                    };

                    const onAwarenessChange = () => {
                        overlay.update(awareness);
                    };

                    target.addEventListener('mousemove', onMouseMove, { passive: true });
                    target.addEventListener('mouseleave', onMouseLeave, { passive: true });
                    awareness.on('change', onAwarenessChange);

                    // Render pointers already present when we join
                    overlay.update(awareness);

                    return {
                        destroy() {
                            target.removeEventListener('mousemove', onMouseMove);
                            target.removeEventListener('mouseleave', onMouseLeave);
                            awareness.off('change', onAwarenessChange);
                            if (rafId != null) cancelAnimationFrame(rafId);
                            try {
                                awareness.setLocalStateField('pointer', null);
                            } catch {
                                // awareness may already be destroyed on teardown
                            }
                            overlay.destroy();
                        },
                    };
                },
            }),
        ];
    },
});

export default MousePointerSync;
