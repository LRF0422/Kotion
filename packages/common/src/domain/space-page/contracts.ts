import type {
    BlockId,
    ClientId,
    CommentId,
    InvitationId,
    PageId,
    ShareCode,
    SpaceId,
    TemplateId,
    UserId,
} from "./ids";

export type UnknownRecord = Record<string, unknown>;
export type Revision = number | string;
export type DateTimeValue = string | number;

/** Canonical paged response. The existing generic entity Page<T> remains available. */
export interface PagedResult<T> {
    records: T[];
    current: number;
    pageSize: number;
    total: number;
    pages?: number;
    hasNext?: boolean;
    [key: string]: unknown;
}

export type SpaceType = "PERSONAL" | "COLLABORATION" | "SPACE" | "TEMPLATE" | "INNER" | "JOURNAL";
export type SpaceVisibility = "PUBLIC" | "PRIVATE";
export type SpaceMemberRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
export type MemberRole = SpaceMemberRole;
export type PagePermission = "READ" | "WRITE" | "ADMIN";
export type PageStatus = "DRAFT" | "PUBLISHED" | "TRASH" | "ARCHIVED" | (string & {});

export interface Space {
    id: SpaceId;
    userId?: UserId;
    name: string;
    homePageId?: PageId;
    icon?: unknown;
    cover?: string | string[];
    description?: string;
    type?: SpaceType;
    visibility?: SpaceVisibility;
    archived?: boolean;
    favorite?: boolean;
    memberCount?: number;
    categories?: TemplateCategory[];
    createTime?: DateTimeValue;
    updateTime?: DateTimeValue;
    createdAt?: DateTimeValue;
    updatedAt?: DateTimeValue;
    metadata?: UnknownRecord;
}

export interface PageMetadata {
    id: PageId;
    spaceId?: SpaceId;
    parentId?: PageId | null;
    title: string;
    pageType?: string;
    name?: string;
    icon?: unknown;
    cover?: string | string[];
    summary?: string;
    status?: PageStatus;
    permission?: PagePermission | null;
    tags?: string[];
    favorite?: boolean;
    pinned?: boolean;
    isDraft?: boolean;
    templateId?: TemplateId;
    userId?: UserId;
    authorId?: UserId;
    createdById?: UserId;
    updatedById?: UserId;
    authorName?: string;
    createTime?: DateTimeValue;
    updateTime?: DateTimeValue;
    createdAt?: DateTimeValue;
    updatedAt?: DateTimeValue;
    metadata?: UnknownRecord;
}

export interface PageRecord extends PageMetadata {
    /** Legacy page-row fallback only. The authoritative document is returned by documents.getPageDocument. */
    legacyContent?: PageDocumentContent | null;
    rev?: Revision | null;
}

export interface PageTreeNode extends PageMetadata {
    children?: PageTreeNode[];
    childCount?: number;
    hasChildren?: boolean;
}

export interface PageSummary {
    id: PageId;
    title: string;
    pageType?: string;
    spaceId?: SpaceId;
    spaceName?: string;
    parentId?: PageId | null;
    icon?: unknown;
    summary?: string;
    status?: PageStatus;
    tags?: string[];
    permission?: PagePermission | null;
    updateTime?: DateTimeValue;
    updatedAt?: DateTimeValue;
    metadata?: UnknownRecord;
}

export interface TemplateCategory {
    id: string;
    text: string;
}

export interface SpacePageTemplate {
    id: TemplateId;
    title: string;
    name?: string;
    description?: string;
    cover?: string[];
    screenShot?: string[];
    author?: string;
    authorId?: UserId;
    authorAvatar?: string;
    category?: string;
    categories?: TemplateCategory[];
    tags?: string[];
    downloads?: number;
    rating?: number;
    createdAt?: DateTimeValue;
    updatedAt?: DateTimeValue;
    sourceType?: "page" | "space" | string;
    sourceId?: PageId | SpaceId;
    spaceId?: SpaceId;
    metadata?: UnknownRecord;
}

export interface UserSummary {
    id: UserId;
    name: string;
    username?: string;
    nickName?: string;
    email?: string;
    avatar?: string;
    avatarUrl?: string;
    metadata?: UnknownRecord;
}

export interface SpaceMember {
    id: UserId;
    userId?: UserId;
    name: string;
    username?: string;
    nickName?: string;
    email?: string;
    avatar?: string;
    avatarUrl?: string;
    role: SpaceMemberRole;
    permission?: PagePermission;
    joinedAt?: DateTimeValue;
    metadata?: UnknownRecord;
}

export interface RoleCapabilities {
    impliedPagePermission: PagePermission | null;
    manageMembers: boolean;
    manageSettings: boolean;
    ownerActions: boolean;
    canLeave: boolean;
}

export interface PageCollaborator {
    id: UserId;
    userId?: UserId;
    name: string;
    username?: string;
    nickName?: string;
    email?: string;
    avatar?: string;
    avatarUrl?: string;
    permission?: PagePermission;
    role?: SpaceMemberRole;
    addedAt?: DateTimeValue;
    metadata?: UnknownRecord;
}

export interface CollaborationInvitation {
    id?: InvitationId;
    token?: string;
    spaceId?: SpaceId;
    pageId?: PageId;
    pageTitle?: string;
    pageType?: string;
    inviteeId?: UserId;
    inviteeName?: string;
    inviteeEmail?: string;
    inviterId?: UserId;
    inviterName?: string;
    permission?: PagePermission;
    permissions?: PagePermission[];
    role?: SpaceMemberRole;
    message?: string;
    status?: string;
    createdAt?: DateTimeValue;
    expiresAt?: DateTimeValue | null;
    metadata?: UnknownRecord;
}

export type PendingInvitation = CollaborationInvitation & { id: InvitationId };

export interface InvitationValidation {
    valid: boolean;
    invitation?: CollaborationInvitation;
    reason?: string;
    metadata?: UnknownRecord;
}

export interface ShareLinkInfo {
    link: string;
    shortCode: ShareCode;
    permission: PagePermission;
    isPublic?: boolean;
    expiresAt?: DateTimeValue | null;
    createdAt?: DateTimeValue;
    metadata?: UnknownRecord;
}

export interface SharedPage {
    pageId: PageId;
    spaceId: SpaceId;
    title: string;
    pageType?: string;
    content?: unknown;
    document?: PageDocumentContent;
    permission: PagePermission;
    expiresAt?: DateTimeValue | null;
    updateTime?: DateTimeValue;
    metadata?: UnknownRecord;
}

export interface PageComment {
    id: CommentId;
    pageId: PageId;
    userId: UserId;
    userName?: string;
    userAvatar?: string;
    content: string;
    parentId?: CommentId | null;
    mentions?: UserId[];
    reactions?: Record<string, UserId[]>;
    resolved?: boolean;
    createdAt?: DateTimeValue;
    updatedAt?: DateTimeValue;
    replies?: PageComment[];
    metadata?: UnknownRecord;
}

export interface PageTag {
    id?: string;
    name: string;
    color?: string;
    count?: number;
    metadata?: UnknownRecord;
}

export type ActivityActionType =
    | "PAGE_CREATED"
    | "PAGE_EDITED"
    | "PAGE_DELETED"
    | "PAGE_RESTORED"
    | "MEMBER_JOINED"
    | "MEMBER_LEFT"
    | "MEMBER_ROLE_CHANGED"
    | "COMMENT_ADDED"
    | "PAGE_PINNED"
    | "PAGE_UNPINNED"
    | (string & {});

export interface SpaceActivity {
    id: string;
    spaceId: SpaceId;
    userId: UserId;
    userName?: string;
    userAvatar?: string;
    actionType: ActivityActionType;
    targetType: "PAGE" | "MEMBER" | "COMMENT" | (string & {});
    targetId?: string;
    metadata?: UnknownRecord;
    createdAt?: DateTimeValue;
}

export interface PageRelation {
    id?: string;
    sourceType?: "PAGE" | "BLOCK" | (string & {});
    sourceId?: string;
    sourcePageId: PageId;
    sourcePageTitle?: string;
    sourcePageIcon?: unknown;
    sourceSpaceId?: SpaceId;
    sourceBlockId?: BlockId | null;
    targetPageId?: PageId;
    targetBlockId?: BlockId;
    snippet?: string;
    linkKind?: "NORMAL" | "MENTION" | "EMBED" | (string & {});
    metadata?: UnknownRecord;
}

export interface GraphNode extends PageSummary {
    spaceId: SpaceId;
}

export interface GraphEdge {
    source: PageId;
    target: PageId;
    linkKind?: string;
    metadata?: UnknownRecord;
}

export interface SpaceGraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface BlockSummary {
    id: BlockId;
    pageId?: PageId;
    pageTitle?: string;
    spaceId?: SpaceId;
    spaceName?: string;
    type?: string;
    text?: string;
    content?: unknown;
    parentId?: BlockId | null;
    metadata?: UnknownRecord;
}

export type PageHistoryKind = "AUTO" | "USER" | "RESTORE" | "IMPORT" | string;

export interface PageHistoryItem {
    rev: Revision;
    kind: PageHistoryKind;
    label?: string | null;
    actor?: unknown;
    createdAt?: DateTimeValue | null;
    current?: boolean;
    restoredFromRev?: Revision | null;
    metadata?: UnknownRecord;
}

/** Common deliberately does not depend on an editor document implementation. */
export type PageDocumentContent = unknown;

/** Authoritative document-store envelope for page content and revision. */
export interface PageDocument {
    pageId?: PageId;
    /** Canonical document payload. */
    doc?: PageDocumentContent | null;
    /** Permissive transport alias for backends that return the document as `content`. */
    content?: PageDocumentContent | null;
    rev?: Revision | null;
    metadata?: UnknownRecord;
}

export interface PageDocumentSnapshot extends PageDocument {
    rev: Revision;
    kind?: PageHistoryKind;
    createdAt?: DateTimeValue | null;
}

export type PageSessionRole = "HOST" | "COLLABORATOR" | "NONE";

export interface PageSessionState {
    role: PageSessionRole;
    alive: boolean;
    hostUserId?: UserId | null;
    hostName?: string | null;
    hostSelf?: boolean;
    rev?: Revision | null;
    expiresAt?: DateTimeValue | null;
    metadata?: UnknownRecord;
}

export type BlockOperationKind = "insert" | "replace" | "move" | "delete";
export type BlockOperationPosition = "after" | "before" | "firstChild" | "lastChild";

export interface BlockOperation {
    op: BlockOperationKind;
    blockId: BlockId;
    parentId?: BlockId;
    pos?: BlockOperationPosition;
    refBlockId?: BlockId;
    node?: PageDocumentContent;
}

export interface OperationVerdict {
    op?: string;
    blockId?: BlockId;
    status?: "applied" | "stale" | "rejected" | string;
    reason?: string;
    metadata?: UnknownRecord;
}

export interface ApplyPageOperationsRequest {
    baseRev: number | null;
    idempotencyKey: string;
    clientId: ClientId;
    ops: BlockOperation[];
}

export interface ReconcilePageDocumentRequest {
    baseRev: number | null;
    clientId: ClientId;
    doc: PageDocumentContent;
}

export interface ApplyPageOperationsResult {
    rev?: Revision | null;
    opsApplied?: number;
    replayed?: boolean;
    results?: OperationVerdict[];
    metadata?: UnknownRecord;
}

export interface QuerySpacesRequest {
    current?: number;
    page?: number;
    pageSize?: number;
    searchValue?: string;
    type?: SpaceType;
    visibility?: SpaceVisibility;
    favorite?: boolean;
    template?: boolean;
    archived?: boolean;
    [key: string]: unknown;
}

export interface CreateSpaceRequest {
    name: string;
    description?: string;
    icon?: unknown;
    cover?: string | string[];
    type?: SpaceType;
    visibility?: SpaceVisibility;
    [key: string]: unknown;
}

export interface UpdateSpaceRequest extends Partial<CreateSpaceRequest> {
    id: SpaceId;
}

export interface QueryPageTreeRequest {
    spaceId: SpaceId;
    searchValue?: string;
    includeArchived?: boolean;
    [key: string]: unknown;
}

export interface QueryPagesRequest {
    current?: number;
    page?: number;
    pageSize?: number;
    spaceId?: SpaceId;
    parentId?: PageId | null;
    status?: PageStatus;
    searchValue?: string;
    tags?: string[];
    favorite?: boolean;
    pinned?: boolean;
    [key: string]: unknown;
}

export interface CreatePageRequest {
    spaceId: SpaceId;
    title: string;
    pageType?: string;
    parentId?: PageId | null;
    templateId?: TemplateId;
    content?: PageDocumentContent;
    icon?: unknown;
    tags?: string[];
    [key: string]: unknown;
}

export interface UpdatePageTitleRequest {
    pageId: PageId;
    title: string;
}

export interface MovePageRequest {
    pageId: PageId;
    targetParentId: PageId | null;
    targetSpaceId: SpaceId;
}

export interface SavePageAsTemplateRequest {
    pageId: PageId;
    title?: string;
    name?: string;
    description?: string;
    cover?: string[];
    categories?: TemplateCategory[];
    [key: string]: unknown;
}

export interface SaveSpaceAsTemplateRequest {
    spaceId: SpaceId;
    title?: string;
    name?: string;
    description?: string;
    cover?: string[];
    screenShot?: string[];
    categories?: TemplateCategory[];
    [key: string]: unknown;
}

export interface QueryUsersRequest {
    keyword?: string;
    current?: number;
    page?: number;
    pageSize?: number;
    [key: string]: unknown;
}

export interface InviteSpaceMembersRequest {
    spaceId: SpaceId;
    userIds?: UserId[];
    emails?: string[];
    role?: SpaceMemberRole;
    message?: string;
    [key: string]: unknown;
}

export interface UpdateSpaceMemberRoleRequest {
    spaceId: SpaceId;
    userId: UserId;
    role: SpaceMemberRole;
}

export interface CreateCollaborationInvitationRequest {
    spaceId: SpaceId;
    pageId?: PageId;
    collaboratorIds?: UserId[];
    collaboratorEmails?: string[];
    permissions?: PagePermission[];
    role?: SpaceMemberRole;
    message?: string;
    [key: string]: unknown;
}

export interface UpdateCollaboratorPermissionRequest {
    pageId: PageId;
    userId: UserId;
    permission: PagePermission;
}

export interface GenerateShareLinkRequest {
    pageId: PageId;
    isPublic?: boolean;
    permission: PagePermission;
    expiresIn?: number | null;
    [key: string]: unknown;
}

export interface CreatePageCommentRequest {
    pageId: PageId;
    content: string;
    parentId?: CommentId | null;
    mentions?: UserId[];
    [key: string]: unknown;
}

export interface CommentReactionRequest {
    pageId: PageId;
    commentId: CommentId;
    emoji: string;
}

export interface UpdatePageTagsRequest {
    pageId: PageId;
    tags: string[];
}

export interface QuerySpaceActivitiesRequest {
    spaceId: SpaceId;
    current?: number;
    page?: number;
    pageSize?: number;
    actionType?: ActivityActionType;
    [key: string]: unknown;
}

export type QueryRelationsRequest =
    | { pageId: PageId; blockId?: never }
    | { blockId: BlockId; pageId?: never };

export type QuerySpaceGraphRequest = Record<string, never>;

export interface QueryBlocksRequest {
    pageId?: PageId;
    pageTitle?: string;
    spaceId?: SpaceId;
    [key: string]: unknown;
}

export interface SearchBlocksRequest extends QueryBlocksRequest {
    keyword: string;
    current?: number;
    page?: number;
    pageSize?: number;
}

export interface QueryPageHistoryRequest {
    pageId: PageId;
    current?: number;
    page?: number;
    pageSize?: number;
    limit?: number;
}

export interface RestorePageHistoryRequest {
    pageId: PageId;
    targetRev: Revision;
    clientId: ClientId;
}

export interface PageSessionRequest {
    pageId: PageId;
    clientId: ClientId;
}

// Migration aliases for existing plugin-main/editor contract names.
export type Template = SpacePageTemplate;
export type InviteMemberRequest = InviteSpaceMembersRequest;
export type UpdateMemberRoleRequest = Omit<UpdateSpaceMemberRoleRequest, "spaceId"> & {
    spaceId?: SpaceId;
};
export type CreateCommentRequest = CreatePageCommentRequest;
export type BlockOp = BlockOperation;
export type ApplyOpsRequest = ApplyPageOperationsRequest;
export type ReconcileRequest = ReconcilePageDocumentRequest;
export type OpVerdict = OperationVerdict;
export type ApplyOpsResult = ApplyPageOperationsResult;
export type PageDocResult = PageDocument;
