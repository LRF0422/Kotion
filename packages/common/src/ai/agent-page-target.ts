/**
 * Agent page target — the one model for "the page the agent is operating on".
 *
 * Before this module the agent reached pages through four independent, subtly
 * different pathways, and every new surface had to re-derive all of them:
 *
 * - `page-navigation-bridge` — which page is on screen, and where navigation goes;
 * - the tenant-scoped `SpacePageService` — reads/writes for normal pages;
 * - `collaboration-guest-page` — invitation-token access for a page that lives
 *   in the inviter's identity context;
 * - the surface itself — visible editor vs hidden off-screen editor vs floating
 *   window, each with its own can-edit rules.
 *
 * The result was duplication and, repeatedly, missing branches (a page that was
 * readable but not writable; a guest page the hidden editor could not load; an
 * agent that got no editor on the collaboration route). This module collapses
 * those into a single value every consumer resolves instead of branching:
 *
 *   identity  pageId / spaceId / title / parentId
 *   source    'workspace' (tenant service) | 'collaboration-guest' (invitation)
 *   access    canEdit (a READ invitation is readable but not writable)
 *   docs      PageDocumentOperations — the ONLY document capability to use
 *   auth      getCollabToken() — bare access token or invitation envelope
 *   reads     loadMetadata() / loadRecord()
 *   nav       open()
 *
 * Consumers: page tools (metadata/edit target/navigation), the hidden
 * off-screen editor, the floating page window, and the agent's mutating-call
 * veto all resolve a target and use its fields — never the registries directly.
 *
 * The model is a *resolver*, not a second registry: the source registries stay
 * authoritative (they are written by the surfaces that own the data), and this
 * module only merges them into one shape. `resolveAgentPageTarget(undefined)`
 * resolves the page currently on screen; passing an id resolves that page.
 */
import type {
    PageDocumentOperations,
    PageMetadata,
    PageRecord,
} from "../domain/space-page";
import { getAccessToken } from "../utils/auth";
import { resolveService } from "../services/service-resolver";
import {
    getCollaborationGuestPage,
    subscribeCollaborationGuestPage,
    type CollaborationGuestPageCapability,
} from "./collaboration-guest-page";
import {
    getPageNavigationBridge,
    subscribeCurrentPage,
    type CurrentPageContext,
} from "./page-navigation-bridge";

/** Where a page's access comes from. */
export type AgentPageSource = "workspace" | "collaboration-guest";

/** One page, resolved for the agent. See the module doc for the field contract. */
export interface AgentPageTarget {
    readonly pageId: string;
    readonly spaceId?: string;
    readonly title?: string;
    readonly parentId?: string;
    readonly source: AgentPageSource;
    /**
     * Whether the agent may modify the page.
     *
     * False for a READ collaboration invitation. Consumers must veto mutating
     * operations when this is false (see the tool executor's `canMutate`); reads
     * stay available.
     */
    readonly canEdit: boolean;
    /** True when this page lives in another tenant and uses invitation-token ops. */
    readonly isGuest: boolean;
    /** The single document read/write capability for this page. */
    readonly documents: PageDocumentOperations;
    /** Room authentication: bare access token, or the invitation envelope. */
    getCollabToken(): string;
    /** Page row (metadata only), through whichever authority applies. */
    loadMetadata(): Promise<PageMetadata>;
    /** Full page record (including the legacy content bridge), same authority. */
    loadRecord(): Promise<PageRecord>;
    /** Navigate to this page from the current surface, when that is possible. */
    open(): void;
}

const toOptionalString = (value: unknown): string | undefined =>
    value === null || value === undefined ? undefined : String(value);

/** A normal page: tenant-scoped service, user access token, workspace route. */
const workspaceTarget = (
    pageId: string,
    context: CurrentPageContext | undefined,
): AgentPageTarget => {
    // Every service access is lazy: resolving a target must be cheap and must
    // not throw in hosts where the space-page service is not registered (the
    // agent's own tests, or a shell without plugin-main).
    const service = () => resolveService("spacePageService");
    const spaceId = context?.spaceId == null ? undefined : String(context.spaceId);
    return {
        pageId,
        spaceId,
        title: context?.title,
        parentId: context?.parentId == null ? undefined : String(context.parentId),
        source: "workspace",
        canEdit: true,
        isGuest: false,
        get documents() { return service().documents; },
        getCollabToken: () => getAccessToken() ?? "",
        loadMetadata: () => service().pages.getPageMetadata(pageId),
        loadRecord: () => service().pages.getPage(pageId),
        open: () => {
            const bridge = getPageNavigationBridge();
            if (bridge) void bridge.openPage(pageId, context?.spaceId);
        },
    };
};

/** A collaboration guest page: invitation-token capability, guest lease rules. */
const guestTarget = (capability: CollaborationGuestPageCapability): AgentPageTarget => {
    const pageId = String(capability.pageId);
    return {
        pageId,
        spaceId: capability.spaceId,
        title: capability.title,
        source: "collaboration-guest",
        canEdit: capability.canEdit,
        isGuest: true,
        documents: capability.documents,
        getCollabToken: capability.getCollabToken,
        loadMetadata: async () => {
            const record = await capability.getPage();
            return record;
        },
        loadRecord: () => capability.getPage(),
        open: () => {
            if (capability.open) {
                capability.open();
                return;
            }
            // Fallback: only the surface currently showing the page knows how to
            // route to it (its bridge override targets the invitation route).
            const bridge = getPageNavigationBridge();
            const currentPageId = bridge?.getCurrentPage()?.pageId;
            if (bridge && currentPageId != null && String(currentPageId) === pageId) {
                void bridge.openPage(pageId, capability.spaceId);
            }
        },
    };
};

/**
 * Resolved targets are cached so repeated resolution returns the SAME object
 * while the underlying authority has not changed.
 *
 * React consumers (the hidden editor, the floating window) put the target in
 * state and key effects off it; handing them a fresh object on every bridge
 * notification would rebuild the collaboration provider/Y.Doc and drop unsynced
 * local edits the moment the user navigates somewhere else. A guest
 * capability's identity is authoritative (registration replaces it); a
 * workspace target is keyed by its page context signature.
 */
interface CachedTarget {
    target: AgentPageTarget;
    signature: string;
    guestCapability?: CollaborationGuestPageCapability;
}
const targetCache = new Map<string, CachedTarget>();

const workspaceSignature = (
    pageId: string,
    context: CurrentPageContext | undefined,
): string => [
    'workspace',
    pageId,
    context?.spaceId ?? '',
    context?.title ?? '',
    context?.parentId ?? '',
].join('|');

/**
 * Resolve the page the agent should operate on.
 *
 * - `pageId` omitted/null → the page currently on screen (published bridge);
 * - otherwise that explicit page.
 *
 * A registered collaboration guest capability always wins for its page: it is
 * the only authority that can read the cross-tenant row and the only room auth
 * that page accepts.
 */
export const resolveAgentPageTarget = (
    pageId?: string | number | null,
): AgentPageTarget | undefined => {
    const bridge = getPageNavigationBridge();
    const current = bridge?.getCurrentPage();
    const requested = pageId == null ? current?.pageId : pageId;
    const id = toOptionalString(requested);
    if (!id) return undefined;

    const guest = getCollaborationGuestPage(id);
    if (guest) {
        const cached = targetCache.get(id);
        if (cached?.guestCapability === guest) return cached.target;
        const target = guestTarget(guest);
        targetCache.set(id, { target, signature: 'guest', guestCapability: guest });
        return target;
    }

    const context = current && current.pageId != null && String(current.pageId) === id
        ? current
        : undefined;
    const signature = workspaceSignature(id, context);
    const cached = targetCache.get(id);
    if (cached && !cached.guestCapability && cached.signature === signature) {
        return cached.target;
    }
    const target = workspaceTarget(id, context);
    targetCache.set(id, { target, signature });
    return target;
};

/** Convenience: the target of the page currently on screen. */
export const resolveCurrentAgentPageTarget = (): AgentPageTarget | undefined =>
    resolveAgentPageTarget(null);

/**
 * Notified when the resolved target may have changed: the visible page changed,
 * or a guest capability was registered/removed. React hosts use this to
 * re-resolve; imperative tools resolve at call time and do not need it.
 */
export const subscribeAgentPageTargets = (listener: () => void): (() => void) => {
    const offCurrent = subscribeCurrentPage(listener);
    const offGuest = subscribeCollaborationGuestPage(listener);
    return () => {
        offCurrent();
        offGuest();
    };
};
