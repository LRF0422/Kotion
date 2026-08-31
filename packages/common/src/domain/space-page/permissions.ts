import type { PagePermission, RoleCapabilities, SpaceMemberRole } from "./contracts";

export const ROLE_CAPABILITIES: Record<SpaceMemberRole, RoleCapabilities> = {
    OWNER: {
        impliedPagePermission: "ADMIN",
        manageMembers: true,
        manageSettings: true,
        ownerActions: true,
        canLeave: false,
    },
    ADMIN: {
        impliedPagePermission: "ADMIN",
        manageMembers: true,
        manageSettings: true,
        ownerActions: false,
        canLeave: true,
    },
    MEMBER: {
        impliedPagePermission: "WRITE",
        manageMembers: false,
        manageSettings: false,
        ownerActions: false,
        canLeave: true,
    },
    GUEST: {
        impliedPagePermission: null,
        manageMembers: false,
        manageSettings: false,
        ownerActions: false,
        canLeave: true,
    },
};

const PERMISSION_RANK: Record<PagePermission, number> = {
    READ: 1,
    WRITE: 2,
    ADMIN: 3,
};

export const maxPermission = (
    first: PagePermission | null | undefined,
    second: PagePermission | null | undefined
): PagePermission | null => {
    const firstRank = first ? PERMISSION_RANK[first] : 0;
    const secondRank = second ? PERMISSION_RANK[second] : 0;
    const rank = Math.max(firstRank, secondRank);
    if (rank === 0) return null;
    return (Object.keys(PERMISSION_RANK) as PagePermission[])
        .find(permission => PERMISSION_RANK[permission] === rank) ?? null;
};

export const hasPermission = (
    current: PagePermission | null | undefined,
    required: PagePermission
): boolean => (current ? PERMISSION_RANK[current] : 0) >= PERMISSION_RANK[required];

export const canManageMembers = (role?: SpaceMemberRole | null): boolean =>
    Boolean(role && ROLE_CAPABILITIES[role].manageMembers);

export const canManageSettings = (role?: SpaceMemberRole | null): boolean =>
    Boolean(role && ROLE_CAPABILITIES[role].manageSettings);
