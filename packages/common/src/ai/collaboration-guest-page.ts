/**
 * Collaboration guest page capability — cross-tenant page access for the agent.
 *
 * An invited collaborator opens a page through a token-scoped workspace: the
 * page lives in the inviter's identity context, so the normal (tenant-scoped)
 * SpacePageService cannot read or write it. The visible editor gets this
 * capability as a prop, but every *agent* surface does not: the hidden
 * off-screen editor, the floating page window and the page tools all resolve
 * the page through the normal service and would fail with "page not found".
 *
 * The collaboration workspace therefore publishes this capability for as long
 * as it is on screen, and those surfaces consult it before reaching for the
 * tenant-scoped service. It is deliberately a registry (not route state): the
 * agent tools read it imperatively at call time, exactly like the page context
 * bridge they already use.
 *
 * The capability carries the invitation-token-bound document operations, a room
 * authorization envelope (built fresh on every (re)connect so token rotation is
 * handled) and a reader for the page row.
 */
import type { PageDocumentOperations } from "../domain/space-page";
import type { PageRecord } from "../domain/space-page";

export interface CollaborationGuestPageCapability {
    /** Id of the shared page (the only page this capability grants access to). */
    pageId: string;
    /** Space that owns the page, in the inviter's context. */
    spaceId?: string;
    /** Cached title, for callers that only need a label before the reader runs. */
    title?: string;
    /**
     * The invitation token itself. Needed to build navigation that only the
     * workspace route understands (`/collaborate/:token`), e.g. "open full page"
     * from the floating window.
     */
    invitationToken?: string;
    /**
     * Whether the invitation grants write access. A read-only invitation may be
     * shown, but agent editing must fail closed instead of producing edits the
     * backend will refuse.
     */
    canEdit: boolean;
    /** Document read/write operations bound to the invitation token. */
    documents: PageDocumentOperations;
    /**
     * Authorization for the page's collaboration room: a JSON envelope
     * `{ accessToken, invitationToken }`, rebuilt on every call so the room can
     * re-authenticate with a fresh access token after a reconnect.
     */
    getCollabToken: () => string;
    /** Read the page row through the invitation (title, type, parents, …). */
    getPage: () => Promise<PageRecord>;
    /**
     * Navigate back to this page's surface (the invitation workspace). Provided
     * by the workspace that owns the route; the agent's unified page target uses
     * it so `open` on a guest page lands in the workspace, not in a space route
     * the invitee cannot see.
     */
    open?: () => void;
}

const capabilities = new Map<string, CollaborationGuestPageCapability>();
const listeners = new Set<() => void>();

const notify = (): void => {
    for (const listener of [...listeners]) {
        try {
            listener();
        } catch {
            // One broken subscriber must not stop the others.
        }
    }
};

/**
 * Publish the capability for a page. Returns the unregister function; the
 * workspace calls it when it unmounts (leaving the invitation page), and a
 * stale unregister is a no-op so a re-registered capability cannot be removed
 * by the previous owner's cleanup.
 */
export const registerCollaborationGuestPage = (
    capability: CollaborationGuestPageCapability,
): (() => void) => {
    const pageId = String(capability.pageId);
    const record = { ...capability, pageId };
    capabilities.set(pageId, record);
    notify();
    return () => {
        if (capabilities.get(pageId) !== record) return;
        capabilities.delete(pageId);
        notify();
    };
};

/** The guest capability for a page, if a collaboration workspace published one. */
export const getCollaborationGuestPage = (
    pageId: string | number | null | undefined,
): CollaborationGuestPageCapability | undefined => {
    if (pageId === null || pageId === undefined) return undefined;
    return capabilities.get(String(pageId));
};

/** Notified whenever a capability is registered or removed. */
export const subscribeCollaborationGuestPage = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
