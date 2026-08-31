import type {
    ApplyPageOperationsRequest,
    ApplyPageOperationsResult,
    BlockSummary,
    CollaborationInvitation,
    CommentReactionRequest,
    CreateCollaborationInvitationRequest,
    CreatePageCommentRequest,
    CreatePageRequest,
    CreateSpaceRequest,
    GenerateShareLinkRequest,
    InvitationValidation,
    InviteSpaceMembersRequest,
    MovePageRequest,
    PageCollaborator,
    PageComment,
    PageDocument,
    PageDocumentSnapshot,
    PageHistoryItem,
    PageMetadata,
    PageRecord,
    PageRelation,
    PageSessionRequest,
    PageSessionState,
    PageSummary,
    PageTag,
    PageTreeNode,
    PagedResult,
    PendingInvitation,
    QueryBlocksRequest,
    QueryPageHistoryRequest,
    QueryPagesRequest,
    QueryPageTreeRequest,
    QueryRelationsRequest,
    QuerySpaceActivitiesRequest,
    QuerySpaceGraphRequest,
    QuerySpacesRequest,
    QueryUsersRequest,
    ReconcilePageDocumentRequest,
    RestorePageHistoryRequest,
    SavePageAsTemplateRequest,
    SaveSpaceAsTemplateRequest,
    SearchBlocksRequest,
    SharedPage,
    ShareLinkInfo,
    Space,
    SpaceActivity,
    SpaceGraphData,
    SpaceMember,
    SpacePageTemplate,
    UpdateCollaboratorPermissionRequest,
    UpdatePageTagsRequest,
    UpdateSpaceMemberRoleRequest,
    UpdateSpaceRequest,
    UserSummary,
} from "./contracts";
import type {
    BlockId,
    CommentId,
    InvitationId,
    PageId,
    ShareCode,
    SpaceId,
    TemplateId,
    UserId,
} from "./ids";
import type { SpacePageChangeStream } from "./change-stream";

export type KeepaliveOperationResult = void | Promise<unknown>;

export interface SpaceOperations {
    getSpace(spaceId: SpaceId): Promise<Space>;
    getPersonalSpace(): Promise<Space>;
    querySpaces(request?: QuerySpacesRequest): Promise<PagedResult<Space>>;
    createSpace(request: CreateSpaceRequest): Promise<Space | void>;
    updateSpace(request: UpdateSpaceRequest): Promise<Space | void>;
    archiveSpace(spaceId: SpaceId): Promise<void>;
    unarchiveSpace(spaceId: SpaceId): Promise<void>;
    deleteSpace(spaceId: SpaceId): Promise<void>;
    toggleSpaceFavorite(spaceId: SpaceId): Promise<void>;
}

export interface PageOperations {
    getPage(pageId: PageId): Promise<PageRecord>;
    getPageMetadata(pageId: PageId): Promise<PageMetadata>;
    getPageTree(request: QueryPageTreeRequest): Promise<PageTreeNode[]>;
    queryPages(request?: QueryPagesRequest): Promise<PagedResult<PageSummary>>;
    queryRecentPages(request?: QueryPagesRequest): Promise<PagedResult<PageSummary>>;
    queryFavoritePages(request?: QueryPagesRequest): Promise<PagedResult<PageSummary>>;
    createPage(request: CreatePageRequest): Promise<PageRecord>;
    movePage(request: MovePageRequest): Promise<void>;
    movePageToTrash(pageId: PageId): Promise<void>;
    restorePageFromTrash(pageId: PageId): Promise<void>;
    favoritePage(pageId: PageId): Promise<void>;
    unfavoritePage(pageId: PageId): Promise<void>;
    togglePagePin(spaceId: SpaceId, pageId: PageId): Promise<void>;
    getPinnedPages(spaceId: SpaceId): Promise<PageSummary[]>;
}

export interface TemplateOperations {
    queryTemplates(): Promise<SpacePageTemplate[]>;
    getSpaceTemplates(spaceId: SpaceId): Promise<SpacePageTemplate[]>;
    savePageAsTemplate(request: SavePageAsTemplateRequest): Promise<SpacePageTemplate | void>;
    saveSpaceAsTemplate(request: SaveSpaceAsTemplateRequest): Promise<SpacePageTemplate | void>;
    deleteTemplate(templateId: TemplateId): Promise<void>;
}

export interface MemberPermissionOperations {
    searchUsers(request: QueryUsersRequest): Promise<PagedResult<UserSummary>>;
    listSpaceMembers(spaceId: SpaceId): Promise<SpaceMember[]>;
    inviteSpaceMembers(request: InviteSpaceMembersRequest): Promise<void>;
    updateSpaceMemberRole(request: UpdateSpaceMemberRoleRequest): Promise<void>;
    removeSpaceMember(spaceId: SpaceId, userId: UserId): Promise<void>;
    leaveSpace(spaceId: SpaceId): Promise<void>;
    transferSpaceOwnership(spaceId: SpaceId, newOwnerId: UserId): Promise<void>;
    listPendingInvitations(spaceId: SpaceId): Promise<PendingInvitation[]>;
    revokeInvitation(spaceId: SpaceId, invitationId: InvitationId): Promise<void>;
}

export interface CollaborationOperations {
    createInvitation(request: CreateCollaborationInvitationRequest): Promise<CollaborationInvitation | void>;
    validateInvitation(token: string): Promise<InvitationValidation>;
    acceptInvitation(token: string): Promise<void>;
    getInvitationPage(token: string): Promise<PageRecord>;
    getPageCollaborators(pageId: PageId): Promise<PageCollaborator[]>;
    updateCollaboratorPermission(request: UpdateCollaboratorPermissionRequest): Promise<void>;
    removePageCollaborator(pageId: PageId, userId: UserId): Promise<void>;
}

export interface ShareOperations {
    getPageShareLink(pageId: PageId): Promise<ShareLinkInfo | null>;
    generateShareLink(request: GenerateShareLinkRequest): Promise<ShareLinkInfo>;
    disableShareLink(pageId: PageId, shortCode: ShareCode): Promise<void>;
    resolveShareLink(shortCode: ShareCode): Promise<SharedPage>;
}

export interface CommentOperations {
    getPageComments(pageId: PageId): Promise<PageComment[]>;
    getPageCommentCount(pageId: PageId): Promise<number>;
    createPageComment(request: CreatePageCommentRequest): Promise<PageComment | void>;
    deletePageComment(pageId: PageId, commentId: CommentId): Promise<void>;
    togglePageCommentResolved(pageId: PageId, commentId: CommentId): Promise<void>;
    addCommentReaction(request: CommentReactionRequest): Promise<void>;
    removeCommentReaction(request: CommentReactionRequest): Promise<void>;
}

export interface TagOperations {
    getSpaceTags(spaceId: SpaceId): Promise<Array<string | PageTag>>;
    updatePageTags(request: UpdatePageTagsRequest): Promise<Array<string | PageTag>>;
}

export interface ActivityOperations {
    querySpaceActivities(request: QuerySpaceActivitiesRequest): Promise<PagedResult<SpaceActivity>>;
}

export interface RelationOperations {
    queryPageRelations(request: QueryRelationsRequest): Promise<PageRelation[]>;
    getSpaceGraph(request?: QuerySpaceGraphRequest): Promise<SpaceGraphData>;
    queryBlocks(request: QueryBlocksRequest): Promise<BlockSummary[]>;
    getBlock(blockId: BlockId): Promise<BlockSummary>;
    searchBlocks(request: SearchBlocksRequest): Promise<BlockSummary[]>;
    reindexBlocks?(): Promise<void>;
}

export interface PageHistoryOperations {
    getPageHistory(request: QueryPageHistoryRequest): Promise<PagedResult<PageHistoryItem>>;
    getPageHistoryDocument(pageId: PageId, rev: number | string): Promise<PageDocumentSnapshot>;
    createPageCheckpoint(pageId: PageId, clientId: string, label?: string): Promise<PageHistoryItem | void>;
    restorePageRevision(request: RestorePageHistoryRequest): Promise<ApplyPageOperationsResult>;
}

export interface PageSessionOperations {
    claimPageSession(request: PageSessionRequest): Promise<PageSessionState>;
    heartbeatPageSession(request: PageSessionRequest): Promise<PageSessionState>;
    /** Must support a fire-and-forget keepalive transport during pagehide. */
    releasePageSession(request: PageSessionRequest): KeepaliveOperationResult;
}

export interface PageOperationOperations {
    applyPageOperations(pageId: PageId, request: ApplyPageOperationsRequest): Promise<ApplyPageOperationsResult>;
    reconcilePageDocument(pageId: PageId, request: ReconcilePageDocumentRequest): Promise<ApplyPageOperationsResult>;
    /** Must support a keepalive transport during pagehide. */
    flushPageOperations(pageId: PageId, request: ApplyPageOperationsRequest): KeepaliveOperationResult;
}

export interface PageDocumentOperations
    extends PageHistoryOperations,
        PageSessionOperations,
        PageOperationOperations {
    /** The block/document store is authoritative; PageRecord only carries legacy fallback content. */
    getPageDocument(pageId: PageId): Promise<PageDocument>;
    /** Claim the exclusive right to seed an empty collaborative Y.Doc from REST content. */
    claimPageSeed(request: PageSessionRequest): Promise<boolean>;
    /** Best-effort release; may use a fire-and-forget or keepalive transport. */
    releasePageSeed(request: PageSessionRequest): KeepaliveOperationResult;
}

/** Namespaced façade used by consumers: service.pages.createPage(...), etc. */
export interface SpacePageService {
    readonly spaces: SpaceOperations;
    readonly pages: PageOperations;
    readonly templates: TemplateOperations;
    readonly members: MemberPermissionOperations;
    readonly collaboration: CollaborationOperations;
    readonly shares: ShareOperations;
    readonly comments: CommentOperations;
    readonly tags: TagOperations;
    readonly activity: ActivityOperations;
    readonly relations: RelationOperations;
    readonly documents: PageDocumentOperations;
    readonly changes: SpacePageChangeStream;
}
