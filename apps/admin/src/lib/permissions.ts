import { getAuthUser, hasAnyAuthority, hasPermission, type AuthUser } from './auth'

/** 拥有全部平台权限的角色（与后端 `RoleConstant.HAS_ROLE_ADMIN` 对齐）。 */
export const ADMIN_AUTHORITIES = ['administrator', 'PLATFORM_SUPER_ADMIN']

/**
 * 判定当前操作者是否具备任一权限码。
 *
 * 注意：**fail-closed**。权限数组缺失时不再放行（旧实现的 fail-open 会让
 * 任何能登录的账号看到全部运营入口），只有明确的管理员角色才豁免。
 */
export const can = (user: AuthUser | null | undefined, ...codes: string[]): boolean => {
  if (!user) return false
  if (hasAnyAuthority(user.authority, ADMIN_AUTHORITIES)) return true
  if (!user.permissions || user.permissions.length === 0) return false
  return codes.some((code) => hasPermission(user.permissions, code))
}

/** 运营读权限：新码优先，过渡期兼容旧码。 */
export const OPS_READ_CODES = ['platform.landing.read', 'platform.dashboard.read']
/** 运营写权限：新码优先，过渡期兼容旧码。 */
export const OPS_MANAGE_CODES = ['platform.landing.manage', 'platform.settings.manage']
/** 订阅运维权限：新码优先；过渡期兼容平台仪表盘读权限，保证运营账号可见。 */
export const SUBSCRIPTION_CODES = ['platform.subscription.manage', 'platform.dashboard.read']

export interface OpsPermission {
  canRead: boolean
  canManage: boolean
}

/** 读取当前操作者的运营读写权限（每次渲染重新读取 localStorage）。 */
export const useOpsPermission = (): OpsPermission => {
  const user = getAuthUser()
  return {
    canRead: can(user, ...OPS_READ_CODES),
    canManage: can(user, ...OPS_MANAGE_CODES),
  }
}

export const canAccess = (codes: string[] | undefined, user: AuthUser | null) =>
  !codes || codes.length === 0 ? true : can(user, ...codes)
