export interface ApiResponse<T> {
    code: number
    success?: boolean
    msg?: string
    data: T
}

export type ContextType = 'INDIVIDUAL' | 'TEAM'
export type OrganizationRole = 'PERSONAL_OWNER' | 'ORG_OWNER' | 'ORG_ADMIN' | 'ORG_MEMBER' | 'ORG_GUEST'
export type AssignableOrganizationRole = Exclude<OrganizationRole, 'PERSONAL_OWNER' | 'ORG_OWNER'>

export interface CurrentUser {
    id?: string
    code?: string
    account?: string
    name?: string
    realName?: string
    avatar?: string
    email?: string
    phone?: string
    birthday?: string
    sex?: number
    roleId?: string
    deptId?: string
    postId?: string
    roleName?: string
    roleAlias?: string
    deptName?: string
    sexName?: string
    tenantId?: string
    isSetup?: boolean
    status?: number
}

export interface UpdateProfileBody {
    name: string
    realName: string
    avatar: string
}

export interface UpdatePasswordBody {
    oldPassword: string
    newPassword: string
    confirmPassword: string
}

export interface ContextVO {
    id: string
    name: string
    type: ContextType
    memberRole: OrganizationRole
    status: number
    ownerUserId?: string
}

export interface CreateOrganizationBody {
    name: string
}

export interface OrganizationMember {
    id: string
    userId: string
    account: string
    name?: string
    avatar?: string
    displayName?: string
    jobTitle?: string
    memberRole: OrganizationRole
    /** 0 invited, 1 active, 2 suspended. */
    status: number
    joinedAt?: string
    invitationExpiresAt?: string
}

export interface InviteOrganizationMemberBody {
    account: string
    role: AssignableOrganizationRole
}

export interface OrganizationInvitation {
    token: string
    expiresAt: string
}

export interface UpdateOrganizationMemberRoleBody {
    role: AssignableOrganizationRole
}

export interface SwitchContextBody {
    refreshToken: string
}

export interface ContextTokenResponse {
    accessToken?: string
    refreshToken?: string
    access_token?: string
    refresh_token?: string
}

export interface TokenContextState {
    contextId?: string
    contextType?: ContextType
}
