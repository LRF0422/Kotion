import {
    ROLE_CAPABILITIES,
    canManageMembers,
    canManageSettings,
    hasPermission,
    maxPermission,
} from "./permissions";

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message);
};

assert(ROLE_CAPABILITIES.OWNER.impliedPagePermission === "ADMIN", "owners should imply admin access");
assert(ROLE_CAPABILITIES.GUEST.impliedPagePermission === null, "guests should rely on explicit page grants");
assert(maxPermission("READ", "WRITE") === "WRITE", "maxPermission should select the stronger grant");
assert(maxPermission(undefined, null) === null, "missing grants should produce no access");
assert(hasPermission("ADMIN", "WRITE"), "admin should satisfy write access");
assert(!hasPermission("READ", "WRITE"), "read should not satisfy write access");
assert(canManageMembers("ADMIN"), "admins should manage members");
assert(!canManageMembers("MEMBER"), "members should not manage members");
assert(canManageSettings("OWNER"), "owners should manage settings");
assert(!canManageSettings(null), "missing roles should not manage settings");

console.log("space-page permission checks passed");
