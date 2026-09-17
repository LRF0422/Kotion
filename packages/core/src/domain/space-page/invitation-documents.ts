import type { PageDocumentOperations } from "@kn/common";
import { normalizeId } from "@kn/common";
import { SPACE_PAGE_ENDPOINTS as E, type SpacePageEndpoint } from "./api";
import {
    normalizeDocument,
    normalizeDocumentSnapshot,
    normalizeHistoryItem,
    normalizeOperationResult,
    normalizePagedResult,
    normalizeSession,
} from "./normalizers";
import { createCommonSpacePageTransport, type SpacePageTransport } from "./transport";

/**
 * A {@link PageDocumentOperations} implementation bound to a collaboration
 * invitation token instead of the caller's identity context.
 *
 * The invitee belongs to a different tenant than the page owner, so the normal
 * tenant-scoped /page/** document routes cannot see the page. Every method here
 * hits the invitation-scoped document API, where the token (plus the invitee's
 * access token) is the authorization.
 */
export const createInvitationDocumentOperations = (
    token: string,
    transport: SpacePageTransport = createCommonSpacePageTransport(),
): PageDocumentOperations => {
    const execute = <T = unknown>(endpoint: SpacePageEndpoint, params?: Record<string, unknown>, body?: unknown) =>
        transport.execute<T>({ endpoint, params: params ?? { token }, body });
    const keepalive = (
        endpoint: SpacePageEndpoint,
        pathParams: Record<string, unknown>,
        query: Record<string, unknown> | undefined,
        body: unknown,
    ) => transport.keepalive({ endpoint, pathParams, query, body });

    return {
        async getPageDocument(pageId) {
            const p = normalizeId(pageId, "pageId");
            const document = normalizeDocument(await execute(E.collaboration.invitationDocument));
            return { ...document, pageId: document.pageId ?? p };
        },
        async getPageHistory(request) {
            const { beforeRev, limit } = request as { beforeRev?: number; limit?: number };
            return normalizePagedResult(
                await execute(E.collaboration.invitationHistory, {
                    token: token,
                    ...(beforeRev == null ? {} : { beforeRev }),
                    ...(limit == null ? {} : { limit }),
                }),
                (item: any) => item?.rev == null ? undefined : normalizeHistoryItem(item),
            );
        },
        async getPageHistoryDocument(pageId, rev) {
            return normalizeDocumentSnapshot(
                await execute(E.collaboration.invitationHistoryDocument, { token: token, rev }),
            );
        },
        async createPageCheckpoint(pageId, clientId, label) {
            const raw = await execute(
                E.collaboration.invitationCheckpoint,
                { token: token },
                { clientId, ...(label == null ? {} : { label }) },
            );
            return raw == null ? undefined : normalizeHistoryItem(raw);
        },
        async restorePageRevision(request) {
            return normalizeOperationResult(
                await execute(
                    E.collaboration.invitationRestore,
                    { token: token },
                    { targetRev: request.targetRev, clientId: request.clientId },
                ),
            );
        },
        async claimPageSession(request) {
            return normalizeSession(
                await execute(
                    E.collaboration.invitationClaimSession,
                    { token: token },
                    { clientId: request.clientId },
                ),
            );
        },
        async heartbeatPageSession(request) {
            return normalizeSession(
                await execute(
                    E.collaboration.invitationHeartbeatSession,
                    { token: token },
                    { clientId: request.clientId },
                ),
            );
        },
        releasePageSession(request) {
            return keepalive(
                E.collaboration.invitationReleaseSession,
                { token: token },
                undefined,
                { clientId: request.clientId },
            );
        },
        async applyPageOperations(pageId, request) {
            return normalizeOperationResult(
                await execute(E.collaboration.invitationOperations, { token: token }, request),
            );
        },
        async reconcilePageDocument(pageId, request) {
            return normalizeOperationResult(
                await execute(E.collaboration.invitationReconcile, { token: token }, request),
            );
        },
        flushPageOperations(pageId, request) {
            return keepalive(
                E.collaboration.invitationOperations,
                { token: token },
                undefined,
                request,
            );
        },
        async claimPageSeed(request) {
            const raw = await execute(
                E.collaboration.invitationClaimSeed,
                { token: token, clientId: request.clientId },
                null,
            );
            return raw === true;
        },
        releasePageSeed(request) {
            return keepalive(
                E.collaboration.invitationReleaseSeed,
                { token: token },
                { clientId: request.clientId },
                undefined,
            );
        },
    };
};
