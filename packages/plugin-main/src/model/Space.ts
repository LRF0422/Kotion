export type SpaceType = 'PERSONAL' | 'COLLABORATION' | 'SPACE' | 'TEMPLATE' | 'INNER' | 'JOURNAL'
export type SpaceVisibility = 'PUBLIC' | 'PRIVATE'
export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST'

export interface Space {
    id: string
    /** Owner user id — compare with the current user to tell "owned" from "joined" */
    userId?: string | number
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

// ==================== Permission Matrix ====================

/** Page-level permission values (backend enum). UI labels: 可查看 / 可编辑 / 可管理 */
export type PagePermission = 'READ' | 'WRITE' | 'ADMIN'

/** What each space role is allowed to do inside a space */
export interface RoleCapabilities {
    /** Implied page permission for all pages of the space (null = per-page grants only) */
    impliedPagePermission: PagePermission | null
    /** Invite / remove members, change roles */
    manageMembers: boolean
    /** Edit space settings (basic info, visibility) */
    manageSettings: boolean
    /** Transfer ownership / delete space */
    ownerActions: boolean
    /** Can leave the space voluntarily */
    canLeave: boolean
}

export const ROLE_CAPABILITIES: Record<MemberRole, RoleCapabilities> = {
    OWNER: {
        impliedPagePermission: 'ADMIN',
        manageMembers: true,
        manageSettings: true,
        ownerActions: true,
        canLeave: false
    },
    ADMIN: {
        impliedPagePermission: 'ADMIN',
        manageMembers: true,
        manageSettings: true,
        ownerActions: false,
        canLeave: true
    },
    MEMBER: {
        impliedPagePermission: 'WRITE',
        manageMembers: false,
        manageSettings: false,
        ownerActions: false,
        canLeave: true
    },
    GUEST: {
        impliedPagePermission: null,
        manageMembers: false,
        manageSettings: false,
        ownerActions: false,
        canLeave: true
    }
}

const PERMISSION_RANK: Record<PagePermission, number> = { READ: 1, WRITE: 2, ADMIN: 3 }

/** max(a, b) over page permissions; null means no access */
export function maxPermission(
    a: PagePermission | null | undefined,
    b: PagePermission | null | undefined
): PagePermission | null {
    const ra = a ? PERMISSION_RANK[a] : 0
    const rb = b ? PERMISSION_RANK[b] : 0
    const max = Math.max(ra, rb)
    if (max === 0) return null
    return (Object.keys(PERMISSION_RANK) as PagePermission[]).find(p => PERMISSION_RANK[p] === max) ?? null
}

export function hasPermission(
    current: PagePermission | null | undefined,
    required: PagePermission
): boolean {
    return (current ? PERMISSION_RANK[current] : 0) >= PERMISSION_RANK[required]
}

export function canManageMembers(role?: MemberRole | null): boolean {
    return !!role && ROLE_CAPABILITIES[role].manageMembers
}

export function canManageSettings(role?: MemberRole | null): boolean {
    return !!role && ROLE_CAPABILITIES[role].manageSettings
}

// ==================== Share Link ====================

export interface ShareLinkInfo {
    link: string
    shortCode: string
    permission: PagePermission
    isPublic?: boolean
    expiresAt?: string | null
    createdAt?: string
}

export interface SharedPage {
    pageId: string | number
    spaceId: string | number
    title: string
    content: string
    permission: PagePermission
    expiresAt?: string | null
    updateTime?: string
}

// ==================== Pending Invitation ====================

export interface PendingInvitation {
    id: string | number
    spaceId: string | number
    pageId?: string | number
    pageTitle?: string
    inviteeId: string | number
    inviteeName?: string
    inviteeEmail?: string
    inviterId?: string | number
    inviterName?: string
    permission: PagePermission
    createdAt?: string
    expiresAt?: string | null
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
