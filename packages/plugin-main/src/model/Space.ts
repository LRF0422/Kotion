export type SpaceType = 'PERSONAL' | 'COLLABORATION' | 'SPACE' | 'TEMPLATE' | 'INNER' | 'JOURNAL'
export type SpaceVisibility = 'PUBLIC' | 'PRIVATE'
export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST'

export interface Space {
    id: string
    name: string
    homePageId?: string
    icon?: any
    cover?: string
    description?: string
    type?: SpaceType
    visibility?: SpaceVisibility
    archived?: boolean
    memberCount?: number
    createTime?: string
    updateTime?: string
}

export interface SpaceMember {
    id: string | number
    name: string
    email?: string
    avatar?: string
    role: MemberRole
    joinedAt?: string
}

export interface InviteMemberRequest {
    spaceId: string | number
    userIds?: (string | number)[]
    emails?: string[]
    role?: MemberRole
    message?: string
}

export interface UpdateMemberRoleRequest {
    userId: string | number
    role: MemberRole
}

// ==================== Activity Feed ====================

export type ActivityActionType =
    | 'PAGE_CREATED'
    | 'PAGE_EDITED'
    | 'PAGE_DELETED'
    | 'PAGE_RESTORED'
    | 'MEMBER_JOINED'
    | 'MEMBER_LEFT'
    | 'MEMBER_ROLE_CHANGED'
    | 'COMMENT_ADDED'
    | 'PAGE_PINNED'
    | 'PAGE_UNPINNED'

export interface SpaceActivity {
    id: string | number
    spaceId: string | number
    userId: string | number
    userName?: string
    userAvatar?: string
    actionType: ActivityActionType
    targetType: 'PAGE' | 'MEMBER' | 'COMMENT'
    targetId?: string
    metadata?: Record<string, any>
    createdAt?: string
}

// ==================== Page Comments ====================

export interface PageComment {
    id: string | number
    pageId: string | number
    userId: string | number
    userName?: string
    userAvatar?: string
    content: string
    parentId?: string | number | null
    mentions?: (string | number)[]
    reactions?: Record<string, (string | number)[]>
    resolved?: boolean
    createdAt?: string
    updatedAt?: string
    replies?: PageComment[]
}

export interface CreateCommentRequest {
    pageId: string | number
    content: string
    parentId?: string | number | null
    mentions?: (string | number)[]
}
