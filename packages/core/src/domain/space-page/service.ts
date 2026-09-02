import {
    createSpacePageChangeStream,
    normalizeId,
    type PageMetadata,
    type SpacePageService,
    type SpacePageTemplate,
    type Space,
} from "@kn/common";
import { SPACE_PAGE_ENDPOINTS as E, type SpacePageEndpoint } from "./api";
import {
    normalizeActivity,
    normalizeArrayEnvelope,
    normalizeBlock,
    normalizeCollaborator,
    normalizeComment,
    normalizeDocument,
    normalizeDocumentSnapshot,
    normalizeGraph,
    normalizeHistoryItem,
    normalizeInvitation,
    normalizeInvitationValidation,
    normalizeMember,
    normalizeOperationResult,
    normalizePageMetadata,
    normalizePageType,
    normalizePageRecord,
    normalizePageSummary,
    normalizePageTreeNode,
    normalizePagedResult,
    normalizePendingInvitation,
    normalizeRelation,
    normalizeSession,
    normalizeSharedPage,
    normalizeShareLink,
    normalizeSpace,
    normalizeTag,
    normalizeTemplate,
    normalizeUser,
} from "./normalizers";
import { createCommonSpacePageTransport, type SpacePageTransport } from "./transport";

const params = (value: object): Record<string, unknown> => value as Record<string, unknown>;
const serializePageContent = (content: unknown): unknown =>
    content !== null && typeof content === "object" ? JSON.stringify(content) : content;

export const createSpacePageService = (
    transport: SpacePageTransport = createCommonSpacePageTransport()
): SpacePageService => {
    const changes = createSpacePageChangeStream();
    const pageSpaces = new Map<string, string>();
    const rememberPage = <T extends { id: string; spaceId?: string }>(page: T): T => {
        if (page.spaceId) pageSpaces.set(page.id, page.spaceId);
        return page;
    };
    const rememberPages = <T extends { id: string; spaceId?: string }>(pages: T[]): T[] => {
        pages.forEach(rememberPage);
        return pages;
    };
    const execute = <T = unknown>(endpoint: SpacePageEndpoint, requestParams?: object, body?: unknown) =>
        transport.execute<T>({ endpoint, params: requestParams ? params(requestParams) : undefined, body });
    const keepalive = (result: void | Promise<unknown>, onSuccess: () => void): void | Promise<unknown> => {
        if (result && typeof (result as Promise<unknown>).then === "function") {
            return (result as Promise<unknown>).then((value) => { onSuccess(); return value; });
        }
        onSuccess();
    };

    const spaces: SpacePageService["spaces"] = {
        async getSpace(spaceId) {
            return normalizeSpace(await execute(E.spaces.detail, { id: normalizeId(spaceId, "spaceId") }));
        },
        async getPersonalSpace() {
            return normalizeSpace(await execute(E.spaces.personal));
        },
        async querySpaces(request = {}) {
            return normalizePagedResult(await execute(E.spaces.list, request), normalizeSpace);
        },
        async createSpace(request) {
            const raw = await execute(E.spaces.createOrUpdate, undefined, request);
            const space = raw == null ? undefined : normalizeSpace(raw);
            changes.emit("space.created", { space });
            return space;
        },
        async updateSpace(request) {
            const body = { ...request, id: normalizeId(request.id, "spaceId") };
            const raw = await execute(E.spaces.createOrUpdate, undefined, body);
            const space = raw == null ? undefined : normalizeSpace(raw);
            changes.emit("space.updated", { space, spaceId: body.id });
            return space;
        },
        async archiveSpace(spaceId) {
            const id = normalizeId(spaceId, "spaceId");
            await execute(E.spaces.archive, { id }, {});
            changes.emit("space.archived", { spaceId: id });
        },
        async unarchiveSpace(spaceId) {
            const id = normalizeId(spaceId, "spaceId");
            await execute(E.spaces.unarchive, { id }, {});
            changes.emit("space.unarchived", { spaceId: id });
        },
        async deleteSpace(spaceId) {
            const id = normalizeId(spaceId, "spaceId");
            await execute(E.spaces.delete, { id });
            changes.emit("space.deleted", { spaceId: id });
        },
        async toggleSpaceFavorite(spaceId) {
            const id = normalizeId(spaceId, "spaceId");
            await execute(E.spaces.toggleFavorite, { id });
            changes.emit("space.favorite.changed", { spaceId: id });
        },
    };

    const pages: SpacePageService["pages"] = {
        async getPage(pageId) {
            return rememberPage(normalizePageRecord(await execute(E.pages.content, { id: normalizeId(pageId, "pageId") })));
        },
        async getPageMetadata(pageId) {
            return rememberPage(normalizePageMetadata(await execute(E.pages.content, { id: normalizeId(pageId, "pageId") })));
        },
        async getPageTree(request) {
            const { spaceId, ...query } = request;
            const normalizedSpaceId = normalizeId(spaceId, "spaceId");
            const tree = normalizeArrayEnvelope(await execute(E.pages.tree, { id: normalizedSpaceId, ...query })).map(normalizePageTreeNode);
            const rememberTree = (nodes: typeof tree) => nodes.forEach(node => {
                pageSpaces.set(node.id, node.spaceId ?? normalizedSpaceId);
                if (node.children) rememberTree(node.children);
            });
            rememberTree(tree);
            return tree;
        },
        async queryPages(request = {}) {
            const result = normalizePagedResult(await execute(E.pages.list, request), normalizePageSummary);
            rememberPages(result.records);
            return result;
        },
        async queryRecentPages(request = {}) {
            const result = normalizePagedResult(await execute(E.pages.recent, request), normalizePageSummary);
            rememberPages(result.records);
            return result;
        },
        async queryFavoritePages(request = {}) {
            const { spaceId, ...query } = request;
            const result = normalizePagedResult(await execute(E.pages.favorites, {
                ...query,
                ...(spaceId ? { scope: normalizeId(spaceId, "spaceId") } : {}),
            }), normalizePageSummary);
            rememberPages(result.records);
            return result;
        },
        async createPage(request) {
            const body = {
                ...request,
                spaceId: normalizeId(request.spaceId, "spaceId"),
                ...(request.pageType === undefined ? {} : { pageType: normalizePageType(request.pageType) }),
                ...(request.content === undefined ? {} : { content: serializePageContent(request.content) }),
            };
            const raw = await execute(E.pages.createOrUpdate, undefined, body);
            const page = typeof raw === "string" || typeof raw === "number" || typeof raw === "bigint"
                ? {
                    id: normalizeId(raw, "page.id"),
                    title: body.title,
                    pageType: body.pageType,
                    spaceId: body.spaceId,
                    parentId: body.parentId ?? null,
                    templateId: body.templateId,
                    icon: body.icon,
                    tags: body.tags,
                }
                : normalizePageRecord(raw);
            rememberPage(page);
            changes.emit("page.created", { page, spaceId: page.spaceId ?? body.spaceId });
            return page;
        },
        async updatePageTitle(request) {
            const pageId = normalizeId(request.pageId, "pageId");
            const knownSpaceId = pageSpaces.get(pageId);
            const raw = await execute(E.pages.title, { id: pageId }, { title: request.title });
            let page: PageMetadata;
            if (raw && typeof raw === "object" && "id" in raw) {
                const normalized = normalizePageMetadata(raw);
                page = rememberPage({ ...normalized, spaceId: normalized.spaceId ?? knownSpaceId });
            } else {
                page = { id: pageId, title: request.title, spaceId: knownSpaceId };
            }
            changes.emit("page.updated", { page, spaceId: page.spaceId });
            if (page.spaceId) changes.emit("page.tree.changed", { spaceId: page.spaceId, pageId });
        },
        async movePage(request) {
            const pageId = normalizeId(request.pageId, "pageId");
            const targetSpaceId = normalizeId(request.targetSpaceId, "targetSpaceId");
            const targetParentId = request.targetParentId == null ? null : normalizeId(request.targetParentId, "targetParentId");
            await execute(E.pages.move, { id: pageId }, { targetParentId, targetSpaceId });
            pageSpaces.set(pageId, targetSpaceId);
            changes.emit("page.moved", { pageId, spaceId: targetSpaceId, parentId: targetParentId });
        },
        async movePageToTrash(pageId) {
            const id = normalizeId(pageId, "pageId");
            await execute(E.pages.trash, { id });
            changes.emit("page.trashed", { pageId: id, spaceId: pageSpaces.get(id) });
        },
        async restorePageFromTrash(pageId) {
            const id = normalizeId(pageId, "pageId");
            await execute(E.pages.restoreFromTrash, { id }, {});
            changes.emit("page.restoredFromTrash", { pageId: id, spaceId: pageSpaces.get(id) });
        },
        async favoritePage(pageId) {
            const id = normalizeId(pageId, "pageId");
            await execute(E.pages.favorite, { id });
            changes.emit("page.favorite.changed", { pageId: id, favorite: true });
        },
        async unfavoritePage(pageId) {
            const id = normalizeId(pageId, "pageId");
            await execute(E.pages.unfavorite, { id });
            changes.emit("page.favorite.changed", { pageId: id, favorite: false });
        },
        async togglePagePin(spaceId, pageId) {
            const normalizedSpaceId = normalizeId(spaceId, "spaceId");
            const normalizedPageId = normalizeId(pageId, "pageId");
            await execute(E.pages.togglePin, { spaceId: normalizedSpaceId, pageId: normalizedPageId }, {});
            changes.emit("page.pin.changed", { spaceId: normalizedSpaceId, pageId: normalizedPageId });
        },
        async getPinnedPages(spaceId) {
            const normalizedSpaceId = normalizeId(spaceId, "spaceId");
            const pages = normalizeArrayEnvelope(await execute(E.pages.pinned, { spaceId: normalizedSpaceId })).map(normalizePageSummary);
            pages.forEach(page => pageSpaces.set(page.id, page.spaceId ?? normalizedSpaceId));
            return pages;
        },
    };

    const templates: SpacePageService["templates"] = {
        async queryTemplates() {
            return normalizeArrayEnvelope(await execute(E.templates.list)).map(normalizeTemplate);
        },
        async getSpaceTemplates(spaceId) {
            return normalizeArrayEnvelope(await execute(E.templates.spaceList, { spaceId: normalizeId(spaceId, "spaceId") })).map(normalizeTemplate);
        },
        async savePageAsTemplate(request) {
            const { pageId, ...body } = request;
            const normalizedPageId = normalizeId(pageId, "pageId");
            const raw = await execute(E.templates.savePage, { id: normalizedPageId }, body);
            const template = raw == null ? undefined : normalizeTemplate(raw);
            changes.emit("template.changed", { templateId: template?.id, template, pageId: normalizedPageId, action: "created" });
            return template;
        },
        async saveSpaceAsTemplate(request) {
            const body = { ...request, spaceId: normalizeId(request.spaceId, "spaceId") };
            const raw = await execute(E.templates.saveSpace, undefined, body);
            const template = raw == null ? undefined : normalizeTemplate(raw);
            changes.emit("template.changed", { templateId: template?.id, template, spaceId: body.spaceId, action: "created" });
            return template;
        },
        async deleteTemplate(templateId) {
            const id = normalizeId(templateId, "templateId");
            await execute(E.templates.delete, { id });
            changes.emit("template.changed", { templateId: id, action: "deleted" });
        },
    };

    const members: SpacePageService["members"] = {
        async searchUsers(request) { return normalizePagedResult(await execute(E.members.searchUsers, request), normalizeUser); },
        async listSpaceMembers(spaceId) { return normalizeArrayEnvelope(await execute(E.members.list, { spaceId: normalizeId(spaceId, "spaceId") })).map(normalizeMember); },
        async inviteSpaceMembers(request) {
            const { spaceId, ...body } = request; const id = normalizeId(spaceId, "spaceId");
            await execute(E.members.invite, { spaceId: id }, body); changes.emit("space.members.changed", { spaceId: id });
        },
        async updateSpaceMemberRole(request) {
            const id = normalizeId(request.spaceId, "spaceId"); const userId = normalizeId(request.userId, "userId");
            await execute(E.members.updateRole, { spaceId: id }, { userId, role: request.role }); changes.emit("space.members.changed", { spaceId: id, userId });
        },
        async removeSpaceMember(spaceId, userId) {
            const s = normalizeId(spaceId, "spaceId"), u = normalizeId(userId, "userId"); await execute(E.members.remove, { spaceId: s, userId: u }); changes.emit("space.members.changed", { spaceId: s, userId: u });
        },
        async leaveSpace(spaceId) { const id = normalizeId(spaceId, "spaceId"); await execute(E.members.leave, { spaceId: id }); changes.emit("space.members.changed", { spaceId: id }); },
        async transferSpaceOwnership(spaceId, newOwnerId) { const s = normalizeId(spaceId, "spaceId"), u = normalizeId(newOwnerId, "newOwnerId"); await execute(E.members.transfer, { spaceId: s, newOwnerId: u }, {}); changes.emit("space.members.changed", { spaceId: s, userId: u }); },
        async listPendingInvitations(spaceId) { return normalizeArrayEnvelope(await execute(E.members.pendingInvitations, { spaceId: normalizeId(spaceId, "spaceId") })).map(normalizePendingInvitation); },
        async revokeInvitation(spaceId, invitationId) { const s = normalizeId(spaceId, "spaceId"), i = normalizeId(invitationId, "invitationId"); await execute(E.members.revokeInvitation, { spaceId: s, invitationId: i }); changes.emit("collaboration.changed", { spaceId: s, invitationId: i, action: "revoked" }); },
    };

    const collaboration: SpacePageService["collaboration"] = {
        async createInvitation(request) {
            const body = { ...request, spaceId: normalizeId(request.spaceId, "spaceId") };
            const raw = await execute(E.collaboration.createInvitation, undefined, body); const invitation = raw == null ? undefined : normalizeInvitation(raw);
            changes.emit("collaboration.changed", { spaceId: body.spaceId, pageId: body.pageId, invitation, invitationId: invitation?.id, action: "created" }); return invitation;
        },
        async validateInvitation(token) { return normalizeInvitationValidation(await execute(E.collaboration.validateInvitation, { token })); },
        async acceptInvitation(token) { await execute(E.collaboration.acceptInvitation, { token }); changes.emit("collaboration.changed", { action: "accepted" }); },
        async getInvitationPage(token) { return normalizePageRecord(await execute(E.collaboration.invitationPage, { token })); },
        async getPageCollaborators(pageId) { return normalizeArrayEnvelope(await execute(E.collaboration.collaborators, { pageId: normalizeId(pageId, "pageId") })).map(normalizeCollaborator); },
        async updateCollaboratorPermission(request) { const p = normalizeId(request.pageId, "pageId"), u = normalizeId(request.userId, "userId"); await execute(E.collaboration.updatePermission, { pageId: p, userId: u }, { permission: request.permission }); changes.emit("page.permissions.changed", { pageId: p, userId: u }); },
        async removePageCollaborator(pageId, userId) { const p = normalizeId(pageId, "pageId"), u = normalizeId(userId, "userId"); await execute(E.collaboration.removeCollaborator, { pageId: p, userId: u }); changes.emit("page.permissions.changed", { pageId: p, userId: u }); },
    };

    const shares: SpacePageService["shares"] = {
        async getPageShareLink(pageId) { const raw = await execute(E.shares.get, { pageId: normalizeId(pageId, "pageId") }); return raw == null ? null : normalizeShareLink(raw); },
        async generateShareLink(request) { const { pageId, ...body } = request; const p = normalizeId(pageId, "pageId"); const share = normalizeShareLink(await execute(E.shares.generate, { pageId: p }, body)); changes.emit("share.changed", { pageId: p, share, action: "enabled" }); return share; },
        async disableShareLink(pageId, shortCode) { const p = normalizeId(pageId, "pageId"); await execute(E.shares.disable, { pageId: p, shortCode }); changes.emit("share.changed", { pageId: p, share: null, action: "disabled" }); },
        async resolveShareLink(shortCode) { return normalizeSharedPage(await execute(E.shares.resolve, { shortCode })); },
    };

    const comments: SpacePageService["comments"] = {
        async getPageComments(pageId) { const p = normalizeId(pageId, "pageId"); return normalizeArrayEnvelope(await execute(E.comments.list, { pageId: p })).map(item => normalizeComment(item, p)); },
        async getPageCommentCount(pageId) { const raw: any = await execute(E.comments.count, { pageId: normalizeId(pageId, "pageId") }); return Number(typeof raw === "object" ? raw?.count ?? 0 : raw ?? 0); },
        async createPageComment(request) { const { pageId, ...body } = request; const p = normalizeId(pageId, "pageId"); const raw = await execute(E.comments.create, { pageId: p }, body); const comment = raw == null ? undefined : normalizeComment(raw, p); changes.emit("page.comments.changed", { pageId: p, commentId: comment?.id, comment }); return comment; },
        async deletePageComment(pageId, commentId) { const p = normalizeId(pageId, "pageId"), c = normalizeId(commentId, "commentId"); await execute(E.comments.delete, { pageId: p, commentId: c }); changes.emit("page.comments.changed", { pageId: p, commentId: c }); },
        async togglePageCommentResolved(pageId, commentId) { const p = normalizeId(pageId, "pageId"), c = normalizeId(commentId, "commentId"); await execute(E.comments.toggleResolved, { pageId: p, commentId: c }, {}); changes.emit("page.comments.changed", { pageId: p, commentId: c }); },
        async addCommentReaction(request) { const p = normalizeId(request.pageId, "pageId"), c = normalizeId(request.commentId, "commentId"); await execute(E.comments.addReaction, { pageId: p, commentId: c, emoji: request.emoji }); changes.emit("page.comments.changed", { pageId: p, commentId: c }); },
        async removeCommentReaction(request) { const p = normalizeId(request.pageId, "pageId"), c = normalizeId(request.commentId, "commentId"); await execute(E.comments.removeReaction, { pageId: p, commentId: c, emoji: request.emoji }); changes.emit("page.comments.changed", { pageId: p, commentId: c }); },
    };

    const tags: SpacePageService["tags"] = {
        async getSpaceTags(spaceId) { return normalizeArrayEnvelope(await execute(E.tags.space, { spaceId: normalizeId(spaceId, "spaceId") })).map(normalizeTag); },
        async updatePageTags(request) { const p = normalizeId(request.pageId, "pageId"); const values = normalizeArrayEnvelope(await execute(E.tags.updatePage, { pageId: p }, request.tags)).map(normalizeTag); const result = values.length ? values : request.tags; changes.emit("page.tags.changed", { pageId: p, tags: result.map((tag) => typeof tag === "string" ? tag : tag.name) }); return result; },
    };

    const activity: SpacePageService["activity"] = {
        async querySpaceActivities(request) { const { spaceId, ...query } = request; return normalizePagedResult(await execute(E.activity.space, { spaceId: normalizeId(spaceId, "spaceId"), ...query }), normalizeActivity); },
    };

    const relations: SpacePageService["relations"] = {
        async queryPageRelations(request) {
            const { pageId, blockId, ...query } = request;
            if (blockId != null) return normalizeArrayEnvelope(await execute(E.relations.blockBacklinks, { blockId: normalizeId(blockId, "blockId"), ...query })).map(normalizeRelation);
            if (pageId == null) throw new TypeError("queryPageRelations requires pageId or blockId");
            return normalizeArrayEnvelope(await execute(E.relations.pageBacklinks, { pageId: normalizeId(pageId, "pageId"), ...query })).map(normalizeRelation);
        },
        async getSpaceGraph(request = {}) { return normalizeGraph(await execute(E.relations.graph, request)); },
        async queryBlocks(request) { return normalizeArrayEnvelope(await execute(E.relations.blocks, request)).map(normalizeBlock); },
        async getBlock(blockId) { return normalizeBlock(await execute(E.relations.blockDetail, { id: normalizeId(blockId, "blockId") })); },
        async searchBlocks(request) { return normalizeArrayEnvelope(await execute(E.relations.searchBlocks, request)).map(normalizeBlock); },
        async reindexBlocks() { await execute(E.relations.reindexBlocks); },
    };

    const documents: SpacePageService["documents"] = {
        async getPageDocument(pageId) { const p = normalizeId(pageId, "pageId"); const document = normalizeDocument(await execute(E.documents.document, { id: p })); return { ...document, pageId: document.pageId ?? p }; },
        async getPageHistory(request) { const { pageId, ...query } = request; return normalizePagedResult(await execute(E.documents.history, { id: normalizeId(pageId, "pageId"), ...query }), (item: any) => item?.rev == null ? undefined : normalizeHistoryItem(item)); },
        async getPageHistoryDocument(pageId, rev) { return normalizeDocumentSnapshot(await execute(E.documents.historyDocument, { id: normalizeId(pageId, "pageId"), rev })); },
        async createPageCheckpoint(pageId, clientId, label) { const p = normalizeId(pageId, "pageId"); const raw = await execute(E.documents.checkpoint, { id: p }, { clientId, ...(label == null ? {} : { label }) }); const history = raw == null ? undefined : normalizeHistoryItem(raw); changes.emit("page.history.changed", { pageId: p, history, rev: history?.rev }); return history; },
        async restorePageRevision(request) { const p = normalizeId(request.pageId, "pageId"); const result = normalizeOperationResult(await execute(E.documents.restoreRevision, { id: p }, { targetRev: request.targetRev, clientId: request.clientId })); changes.emit("page.history.changed", { pageId: p, rev: result.rev ?? request.targetRev }); changes.emit("page.document.changed", { pageId: p, spaceId: pageSpaces.get(p), scope: "content", result }); return result; },
        async claimPageSession(request) { const p = normalizeId(request.pageId, "pageId"); const state = normalizeSession(await execute(E.documents.claimSession, { id: p }, { clientId: request.clientId })); changes.emit("page.session.changed", { pageId: p }); return state; },
        async heartbeatPageSession(request) { const p = normalizeId(request.pageId, "pageId"); return normalizeSession(await execute(E.documents.heartbeatSession, { id: p }, { clientId: request.clientId })); },
        releasePageSession(request) { const p = normalizeId(request.pageId, "pageId"); return keepalive(transport.keepalive({ endpoint: E.documents.releaseSession, pathParams: { id: p }, body: { clientId: request.clientId } }), () => changes.emit("page.session.changed", { pageId: p })); },
        async applyPageOperations(pageId, request) { const p = normalizeId(pageId, "pageId"); const result = normalizeOperationResult(await execute(E.documents.applyOperations, { id: p }, request)); changes.emit("page.document.changed", { pageId: p, spaceId: pageSpaces.get(p), scope: "content", result }); return result; },
        async reconcilePageDocument(pageId, request) { const p = normalizeId(pageId, "pageId"); const result = normalizeOperationResult(await execute(E.documents.reconcile, { id: p }, request)); changes.emit("page.document.changed", { pageId: p, spaceId: pageSpaces.get(p), scope: "content", result }); return result; },
        flushPageOperations(pageId, request) { const p = normalizeId(pageId, "pageId"); return keepalive(transport.keepalive({ endpoint: E.documents.applyOperations, pathParams: { id: p }, body: request }), () => changes.emit("page.document.changed", { pageId: p, spaceId: pageSpaces.get(p), scope: "content" })); },
        async claimPageSeed(request) { const p = normalizeId(request.pageId, "pageId"); const raw = await execute(E.documents.claimSeed, { id: p, clientId: request.clientId }, null); return raw === true; },
        releasePageSeed(request) { const p = normalizeId(request.pageId, "pageId"); return transport.keepalive({ endpoint: E.documents.releaseSeed, pathParams: { id: p }, query: { clientId: request.clientId } }); },
    };

    return { spaces, pages, templates, members, collaboration, shares, comments, tags, activity, relations, documents, changes };
};

