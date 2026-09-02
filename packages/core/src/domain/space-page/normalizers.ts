import {
    normalizeId,
    normalizeNullableId,
    normalizeOptionalId,
    type ApplyPageOperationsResult,
    type BlockSummary,
    type CollaborationInvitation,
    type InvitationValidation,
    type PageCollaborator,
    type PageComment,
    type PageDocument,
    type PageDocumentSnapshot,
    type PageHistoryItem,
    type PageMetadata,
    type PageRecord,
    type PageRelation,
    type PageSessionState,
    type PageSummary,
    type PageTag,
    type PageTreeNode,
    type PagedResult,
    type PendingInvitation,
    type SharedPage,
    type ShareLinkInfo,
    type Space,
    type SpaceActivity,
    type SpaceGraphData,
    type SpaceMember,
    type SpacePageTemplate,
    type UserSummary,
} from "@kn/common";

type Raw = Record<string, any>;

const record = (value: unknown): Raw => value && typeof value === "object" ? value as Raw : {};
const list = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    const raw = record(value);
    return Array.isArray(raw.records) ? raw.records : [];
};
const optionalString = (value: unknown): string | undefined => value == null ? undefined : String(value);
export const normalizePageType = (value: unknown): string | undefined => {
    const normalized = optionalString(value)?.trim();
    return normalized || undefined;
};
const optionalBoolean = (value: unknown): boolean | undefined => value == null ? undefined : Boolean(value);
const stringList = (value: unknown): string[] | undefined => Array.isArray(value) ? value.map(String) : undefined;

export const normalizePagedResult = <T>(
    value: unknown,
    normalize: (item: unknown) => T | null | undefined
): PagedResult<T> => {
    const raw = record(value);
    const records = list(value)
        .map(normalize)
        .filter((item): item is T => item !== null && item !== undefined);
    const current = Number(raw.current ?? raw.page ?? 1);
    const pageSize = Number(raw.pageSize ?? records.length);
    const total = Number(raw.total ?? records.length);
    return {
        ...raw,
        records,
        current: Number.isFinite(current) ? current : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : records.length,
        total: Number.isFinite(total) ? total : records.length,
        ...(raw.pages == null ? {} : { pages: Number(raw.pages) }),
        ...(raw.hasNext == null ? {} : { hasNext: Boolean(raw.hasNext) }),
    };
};

export const normalizeSpace = (value: unknown): Space => {
    const raw = record(value);
    return {
        id: normalizeId(raw.id, "space.id"),
        name: String(raw.name ?? ""),
        userId: normalizeOptionalId(raw.userId, "space.userId"),
        homePageId: normalizeOptionalId(raw.homePageId, "space.homePageId"),
        icon: raw.icon,
        cover: raw.cover,
        description: optionalString(raw.description),
        type: raw.type,
        visibility: raw.visibility,
        archived: optionalBoolean(raw.archived),
        favorite: optionalBoolean(raw.favorite),
        memberCount: raw.memberCount == null ? undefined : Number(raw.memberCount),
        categories: Array.isArray(raw.categories) ? raw.categories : undefined,
        createTime: raw.createTime,
        updateTime: raw.updateTime,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        metadata: raw,
    };
};

export const normalizePageMetadata = (value: unknown): PageMetadata => {
    const raw = record(value);
    return {
        id: normalizeId(raw.id, "page.id"),
        spaceId: normalizeOptionalId(raw.spaceId, "page.spaceId"),
        parentId: raw.parentId == null ? null : normalizeNullableId(raw.parentId, "page.parentId"),
        title: String(raw.title ?? raw.name ?? ""),
        pageType: normalizePageType(raw.pageType),
        name: optionalString(raw.name),
        icon: raw.icon,
        cover: raw.cover,
        summary: optionalString(raw.summary),
        status: raw.status,
        permission: raw.permission ?? undefined,
        tags: stringList(raw.tags),
        favorite: optionalBoolean(raw.favorite),
        pinned: optionalBoolean(raw.pinned),
        isDraft: optionalBoolean(raw.isDraft),
        templateId: normalizeOptionalId(raw.templateId, "page.templateId"),
        userId: normalizeOptionalId(raw.userId, "page.userId"),
        authorId: normalizeOptionalId(raw.authorId, "page.authorId"),
        createdById: normalizeOptionalId(raw.createdById ?? raw.createUser, "page.createdById"),
        updatedById: normalizeOptionalId(raw.updatedById ?? raw.updateUser, "page.updatedById"),
        authorName: optionalString(raw.authorName),
        createTime: raw.createTime,
        updateTime: raw.updateTime,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        metadata: raw,
    };
};

export const normalizePageRecord = (value: unknown): PageRecord => {
    const raw = record(value);
    return {
        ...normalizePageMetadata(raw),
        legacyContent: raw.legacyContent ?? raw.content ?? null,
        rev: raw.rev ?? null,
    };
};

export const normalizePageSummary = (value: unknown): PageSummary => {
    const raw = record(value);
    return {
        ...normalizePageMetadata(raw),
        spaceName: optionalString(raw.spaceName),
    };
};

export const normalizePageTreeNode = (value: unknown): PageTreeNode => {
    const raw = record(value);
    return {
        ...normalizePageMetadata(raw),
        children: Array.isArray(raw.children) ? raw.children.map(normalizePageTreeNode) : undefined,
        childCount: raw.childCount == null ? undefined : Number(raw.childCount),
        hasChildren: optionalBoolean(raw.hasChildren),
    };
};

export const normalizeTemplate = (value: unknown): SpacePageTemplate => {
    const raw = record(value);
    return {
        id: normalizeId(raw.id, "template.id"),
        title: String(raw.title ?? raw.name ?? ""),
        name: optionalString(raw.name),
        description: optionalString(raw.description),
        cover: raw.cover == null ? undefined : Array.isArray(raw.cover) ? raw.cover.map(String) : [String(raw.cover)],
        screenShot: raw.screenShot == null ? undefined : Array.isArray(raw.screenShot) ? raw.screenShot.map(String) : [String(raw.screenShot)],
        author: optionalString(raw.author),
        authorId: normalizeOptionalId(raw.authorId ?? raw.createUser ?? raw.updateUser, "template.authorId"),
        authorAvatar: optionalString(raw.authorAvatar),
        category: optionalString(raw.category ?? raw.categories?.[0]?.text ?? raw.categories?.[0]?.id),
        categories: Array.isArray(raw.categories) ? raw.categories : undefined,
        tags: stringList(raw.tags),
        downloads: raw.downloads == null ? undefined : Number(raw.downloads),
        rating: raw.rating == null ? undefined : Number(raw.rating),
        createdAt: raw.createdAt ?? raw.createTime,
        updatedAt: raw.updatedAt ?? raw.updateTime,
        sourceType: raw.sourceType,
        sourceId: normalizeOptionalId(raw.sourceId, "template.sourceId"),
        spaceId: normalizeOptionalId(raw.spaceId, "template.spaceId"),
        metadata: raw,
    };
};

export const normalizeUser = (value: unknown): UserSummary => {
    const raw = record(value);
    return {
        id: normalizeId(raw.id ?? raw.userId, "user.id"),
        name: String(raw.name ?? raw.realName ?? raw.username ?? raw.nickName ?? raw.account ?? ""),
        username: optionalString(raw.username),
        nickName: optionalString(raw.nickName),
        email: optionalString(raw.email),
        avatar: optionalString(raw.avatar),
        avatarUrl: optionalString(raw.avatarUrl),
        metadata: raw,
    };
};

export const normalizeMember = (value: unknown): SpaceMember => {
    const raw = record(value);
    const user = normalizeUser(raw);
    return { ...user, userId: normalizeOptionalId(raw.userId, "member.userId"), role: raw.role ?? "MEMBER", permission: raw.permission, joinedAt: raw.joinedAt, metadata: raw };
};

export const normalizeCollaborator = (value: unknown): PageCollaborator => {
    const raw = record(value);
    const user = normalizeUser(raw);
    return { ...user, userId: normalizeOptionalId(raw.userId, "collaborator.userId"), permission: raw.permission ?? "READ", role: raw.role, addedAt: raw.addedAt, metadata: raw };
};

export const normalizeInvitation = (value: unknown): CollaborationInvitation => {
    const raw = record(value);
    return {
        id: normalizeOptionalId(raw.id ?? raw.invitationId, "invitation.id"),
        token: optionalString(raw.token ?? raw.invitationToken),
        spaceId: normalizeOptionalId(raw.spaceId, "invitation.spaceId"),
        pageId: normalizeOptionalId(raw.pageId, "invitation.pageId"),
        pageTitle: optionalString(raw.pageTitle),
        pageType: normalizePageType(raw.pageType),
        inviteeId: normalizeOptionalId(raw.inviteeId, "invitation.inviteeId"),
        inviteeName: optionalString(raw.inviteeName), inviteeEmail: optionalString(raw.inviteeEmail),
        inviterId: normalizeOptionalId(raw.inviterId, "invitation.inviterId"), inviterName: optionalString(raw.inviterName),
        permission: raw.permission, permissions: Array.isArray(raw.permissions) ? raw.permissions : undefined,
        role: raw.role, message: optionalString(raw.message), status: optionalString(raw.status),
        createdAt: raw.createdAt, expiresAt: raw.expiresAt, metadata: raw,
    };
};

export const normalizePendingInvitation = (value: unknown): PendingInvitation => {
    const invitation = normalizeInvitation(value);
    return { ...invitation, id: normalizeId(invitation.id as string, "invitation.id") };
};

export const normalizeInvitationValidation = (value: unknown): InvitationValidation => {
    const raw = record(value);
    const invitation = normalizeInvitation(raw.invitation ?? raw);
    const status = invitation.status ?? optionalString(raw.status);
    const invalidStatuses = new Set(["EXPIRED", "REVOKED", "NOT_FOUND", "INVALID"]);
    const invalid = raw.valid === false
        || invalidStatuses.has(String(status ?? ""))
        || !invitation.pageId
        || !invitation.spaceId;
    return {
        valid: !invalid,
        invitation,
        reason: invalid ? optionalString(raw.reason ?? status) : undefined,
        metadata: raw,
    };
};

export const normalizeShareLink = (value: unknown): ShareLinkInfo => {
    const raw = record(value);
    return { link: String(raw.link ?? ""), shortCode: String(raw.shortCode ?? ""), permission: raw.permission ?? "READ", isPublic: optionalBoolean(raw.isPublic), expiresAt: raw.expiresAt, createdAt: raw.createdAt, metadata: raw };
};

export const normalizeSharedPage = (value: unknown): SharedPage => {
    const raw = record(value);
    return { pageId: normalizeId(raw.pageId, "sharedPage.pageId"), spaceId: normalizeId(raw.spaceId, "sharedPage.spaceId"), title: String(raw.title ?? ""), pageType: normalizePageType(raw.pageType), content: raw.content, document: raw.document, permission: raw.permission ?? "READ", expiresAt: raw.expiresAt, updateTime: raw.updateTime, metadata: raw };
};

export const normalizeComment = (value: unknown, fallbackPageId?: string): PageComment => {
    const raw = record(value);
    const pageId = normalizeId(raw.pageId ?? fallbackPageId, "comment.pageId");
    return {
        id: normalizeId(raw.id, "comment.id"), pageId,
        userId: normalizeId(raw.userId ?? raw.createUser, "comment.userId"), userName: optionalString(raw.userName), userAvatar: optionalString(raw.userAvatar),
        content: String(raw.content ?? ""), parentId: raw.parentId == null ? null : normalizeNullableId(raw.parentId, "comment.parentId"),
        mentions: Array.isArray(raw.mentions) ? raw.mentions.map((id: any, index: number) => normalizeId(id, `comment.mentions[${index}]`)) : undefined,
        reactions: raw.reactions && typeof raw.reactions === "object"
            ? Object.fromEntries(Object.entries(raw.reactions).map(([emoji, userIds]) => [
                emoji,
                Array.isArray(userIds)
                    ? userIds.map((id, index) => normalizeId(id as any, `comment.reactions.${emoji}[${index}]`))
                    : [],
            ]))
            : undefined,
        resolved: optionalBoolean(raw.resolved), createdAt: raw.createdAt, updatedAt: raw.updatedAt,
        replies: Array.isArray(raw.replies) ? raw.replies.map((reply: unknown) => normalizeComment(reply, pageId)) : undefined, metadata: raw,
    };
};

export const normalizeTag = (value: unknown): string | PageTag => {
    if (typeof value === "string") return value;
    const raw = record(value);
    return { id: normalizeOptionalId(raw.id, "tag.id"), name: String(raw.name ?? ""), color: optionalString(raw.color), count: raw.count == null ? undefined : Number(raw.count), metadata: raw };
};

export const normalizeActivity = (value: unknown): SpaceActivity => {
    const raw = record(value);
    return { id: normalizeId(raw.id, "activity.id"), spaceId: normalizeId(raw.spaceId, "activity.spaceId"), userId: normalizeId(raw.userId, "activity.userId"), userName: optionalString(raw.userName), userAvatar: optionalString(raw.userAvatar), actionType: raw.actionType ?? "", targetType: raw.targetType ?? "PAGE", targetId: normalizeOptionalId(raw.targetId, "activity.targetId"), metadata: raw.metadata ?? raw, createdAt: raw.createdAt };
};

export const normalizeRelation = (value: unknown): PageRelation => {
    const raw = record(value);
    return {
        id: normalizeOptionalId(raw.id, "relation.id"), sourceType: raw.sourceType,
        sourceId: normalizeOptionalId(raw.sourceId, "relation.sourceId"),
        sourcePageId: normalizeId(raw.sourcePageId, "relation.sourcePageId"),
        sourcePageTitle: optionalString(raw.sourcePageTitle ?? raw.title), sourcePageIcon: raw.sourcePageIcon ?? raw.icon,
        sourceSpaceId: normalizeOptionalId(raw.sourceSpaceId, "relation.sourceSpaceId"),
        sourceBlockId: raw.sourceBlockId == null ? null : normalizeNullableId(raw.sourceBlockId, "relation.sourceBlockId"),
        targetPageId: normalizeOptionalId(raw.targetPageId, "relation.targetPageId"), targetBlockId: normalizeOptionalId(raw.targetBlockId, "relation.targetBlockId"),
        snippet: optionalString(raw.snippet), linkKind: raw.linkKind, metadata: raw,
    };
};

export const normalizeBlock = (value: unknown): BlockSummary => {
    const raw = record(value);
    return { id: normalizeId(raw.id, "block.id"), pageId: normalizeOptionalId(raw.pageId, "block.pageId"), pageTitle: optionalString(raw.pageTitle), spaceId: normalizeOptionalId(raw.spaceId, "block.spaceId"), spaceName: optionalString(raw.spaceName), type: optionalString(raw.type), text: optionalString(raw.text), content: raw.content, parentId: raw.parentId == null ? null : normalizeNullableId(raw.parentId, "block.parentId"), metadata: raw };
};

export const normalizeGraph = (value: unknown): SpaceGraphData => {
    const raw = record(value);
    return {
        nodes: list(raw.nodes).map((item) => {
            const page = normalizePageSummary(item);
            return { ...page, spaceId: normalizeId(record(item).spaceId, "graph.node.spaceId") };
        }),
        edges: list(raw.edges).map((item) => {
            const edge = record(item);
            return { source: normalizeId(edge.source, "graph.edge.source"), target: normalizeId(edge.target, "graph.edge.target"), linkKind: optionalString(edge.linkKind), metadata: edge };
        }),
    };
};

export const normalizeDocument = (value: unknown): PageDocument => {
    const raw = record(value);
    const doc = raw.doc ?? raw.content ?? null;
    return { pageId: normalizeOptionalId(raw.pageId ?? raw.id, "document.pageId"), doc, content: raw.content, rev: raw.rev ?? null, metadata: raw };
};

export const normalizeDocumentSnapshot = (value: unknown): PageDocumentSnapshot => {
    const raw = record(value);
    return { ...normalizeDocument(raw), rev: raw.rev, kind: raw.kind, createdAt: raw.createdAt };
};

export const normalizeHistoryItem = (value: unknown): PageHistoryItem => {
    const raw = record(value);
    if (raw.rev == null) throw new TypeError("history.rev is required");
    return { rev: raw.rev, kind: raw.kind ?? "AUTO", label: raw.label, actor: raw.actor, createdAt: raw.createdAt, current: optionalBoolean(raw.current), restoredFromRev: raw.restoredFromRev, metadata: raw };
};

export const normalizeSession = (value: unknown): PageSessionState => {
    const raw = record(value);
    const role = raw.role === "HOST" || raw.role === "COLLABORATOR" ? raw.role : "NONE";
    return { role, alive: Boolean(raw.alive), hostUserId: raw.hostUserId == null ? null : normalizeNullableId(raw.hostUserId, "session.hostUserId"), hostName: raw.hostName ?? null, hostSelf: Boolean(raw.hostSelf), rev: raw.rev ?? null, expiresAt: raw.expiresAt, metadata: raw };
};

export const normalizeOperationResult = (value: unknown): ApplyPageOperationsResult => {
    const raw = record(value);
    return {
        rev: raw.rev ?? null, opsApplied: raw.opsApplied == null ? undefined : Number(raw.opsApplied), replayed: optionalBoolean(raw.replayed),
        results: Array.isArray(raw.results) ? raw.results.map((item: unknown) => { const result = record(item); return { op: optionalString(result.op), blockId: normalizeOptionalId(result.blockId, "operation.blockId"), status: result.status, reason: optionalString(result.reason), metadata: result }; }) : undefined,
        metadata: raw,
    };
};

export { list as normalizeArrayEnvelope };
