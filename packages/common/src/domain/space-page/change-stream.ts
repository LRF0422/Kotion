import { logger } from "../../utils/logger";
import type {
    ApplyPageOperationsResult,
    CollaborationInvitation,
    PageComment,
    PageDocument,
    PageHistoryItem,
    PageMetadata,
    PageRelation,
    ShareLinkInfo,
    Space,
    SpaceActivity,
    SpaceMember,
    SpacePageTemplate,
    UnknownRecord,
} from "./contracts";
import type {
    CommentId,
    InvitationId,
    PageId,
    SpaceId,
    TemplateId,
    UserId,
} from "./ids";

export type SpacePageDocumentChangeScope = "content" | "metadata" | "unknown";

export interface SpacePageChangeMap {
    "space.created": { space?: Space };
    "space.updated": { space?: Space; spaceId?: SpaceId };
    "space.deleted": { spaceId: SpaceId };
    "space.archived": { spaceId: SpaceId };
    "space.unarchived": { spaceId: SpaceId };
    "space.favorite.changed": { spaceId: SpaceId; favorite?: boolean };
    "space.members.changed": { spaceId: SpaceId; members?: SpaceMember[]; userId?: UserId };
    "space.activity.changed": { spaceId: SpaceId; activity?: SpaceActivity };

    "page.created": { page: PageMetadata; spaceId?: SpaceId };
    "page.updated": { page: PageMetadata; spaceId?: SpaceId };
    "page.deleted": { pageId: PageId; spaceId?: SpaceId };
    "page.trashed": { pageId: PageId; spaceId?: SpaceId };
    "page.restoredFromTrash": { pageId: PageId; spaceId?: SpaceId };
    "page.moved": { pageId: PageId; spaceId: SpaceId; parentId: PageId | null };
    "page.tree.changed": { spaceId: SpaceId; pageId?: PageId };
    "page.favorite.changed": { pageId: PageId; spaceId?: SpaceId; favorite: boolean };
    "page.pin.changed": { pageId: PageId; spaceId: SpaceId; pinned?: boolean };
    "page.document.changed": {
        pageId: PageId;
        spaceId?: SpaceId;
        scope: SpacePageDocumentChangeScope;
        document?: PageDocument;
        result?: ApplyPageOperationsResult;
        metadata?: UnknownRecord;
    };
    "page.permissions.changed": { pageId: PageId; spaceId?: SpaceId; userId?: UserId };
    "page.comments.changed": { pageId: PageId; spaceId?: SpaceId; commentId?: CommentId; comment?: PageComment };
    "page.tags.changed": { pageId: PageId; spaceId?: SpaceId; tags?: string[] };
    "page.relations.changed": { pageId: PageId; spaceId?: SpaceId; relations?: PageRelation[] };
    "page.session.changed": { pageId: PageId; spaceId?: SpaceId };
    "page.history.changed": { pageId: PageId; spaceId?: SpaceId; history?: PageHistoryItem; rev?: number | string };

    "template.changed": {
        templateId?: TemplateId;
        template?: SpacePageTemplate;
        spaceId?: SpaceId;
        pageId?: PageId;
        action?: "created" | "updated" | "deleted" | (string & {});
    };
    "share.changed": {
        pageId: PageId;
        spaceId?: SpaceId;
        share?: ShareLinkInfo | null;
        action?: "enabled" | "updated" | "disabled" | (string & {});
    };
    "collaboration.changed": {
        spaceId?: SpaceId;
        pageId?: PageId;
        userId?: UserId;
        invitationId?: InvitationId;
        invitation?: CollaborationInvitation;
        action?: string;
    };
}

export type SpacePageChangeType = keyof SpacePageChangeMap;

export type SpacePageChange<K extends SpacePageChangeType = SpacePageChangeType> = {
    [P in K]: {
        type: P;
        payload: SpacePageChangeMap[P];
        source?: string;
        timestamp?: number;
    }
}[K];

export type SpacePageChangeListener<K extends SpacePageChangeType = SpacePageChangeType> =
    (change: SpacePageChange<K>) => void;

export interface SpacePageChangeStream {
    emit<K extends SpacePageChangeType>(
        type: K,
        payload: SpacePageChangeMap[K],
        options?: { source?: string; timestamp?: number }
    ): void;
    publish<K extends SpacePageChangeType>(change: SpacePageChange<K>): void;
    subscribe(listener: SpacePageChangeListener): () => void;
    subscribe<K extends SpacePageChangeType>(type: K, listener: SpacePageChangeListener<K>): () => void;
}

export const createSpacePageChangeStream = (): SpacePageChangeStream => {
    const listeners = new Set<SpacePageChangeListener>();
    const typedListeners = new Map<SpacePageChangeType, Set<SpacePageChangeListener>>();

    const publish = <K extends SpacePageChangeType>(change: SpacePageChange<K>): void => {
        const normalized = {
            ...change,
            timestamp: change.timestamp ?? Date.now(),
        } as SpacePageChange<K>;
        const targets = [
            ...listeners,
            ...(typedListeners.get(change.type) ?? []),
        ];

        for (const listener of targets) {
            try {
                listener(normalized as SpacePageChange);
            } catch (error) {
                logger.error(`SpacePageChangeStream: listener failed for "${change.type}"`, error);
            }
        }
    };

    const subscribe: SpacePageChangeStream["subscribe"] = (<K extends SpacePageChangeType>(
        typeOrListener: K | SpacePageChangeListener,
        listener?: SpacePageChangeListener<K>
    ): (() => void) => {
        if (typeof typeOrListener === "function") {
            listeners.add(typeOrListener);
            return () => listeners.delete(typeOrListener);
        }

        const set = typedListeners.get(typeOrListener) ?? new Set<SpacePageChangeListener>();
        const typedListener = listener as SpacePageChangeListener;
        set.add(typedListener);
        typedListeners.set(typeOrListener, set);
        return () => {
            set.delete(typedListener);
            if (set.size === 0) typedListeners.delete(typeOrListener);
        };
    }) as SpacePageChangeStream["subscribe"];

    return {
        emit: (type, payload, options) => publish({ type, payload, ...options } as SpacePageChange),
        publish,
        subscribe,
    };
};
