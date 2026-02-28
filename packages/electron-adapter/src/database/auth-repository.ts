import { AuthInfo, UserInfo, MembershipInfo, UserRole } from '../types';

export class AuthRepository {
  constructor(private db: any) { }

  /**
   * Save auth info
   */
  saveAuthInfo(auth: AuthInfo, role: UserRole = UserRole.AUTHENTICATED): void {
    const now = Date.now();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO auth_info (
          id, access_token, refresh_token, token_type, expires_in,
          user_id, tenant_id, account, user_name, avatar, user_role,
          created_at, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        auth.accessToken,
        auth.refreshToken,
        auth.tokenType,
        auth.expiresIn,
        auth.userId,
        auth.tenantId || null,
        auth.account,
        auth.userName || null,
        auth.avatar || null,
        role,
        now,
        now
      );
  }

  /**
   * Get auth info
   */
  getAuthInfo(): (AuthInfo & { userRole: UserRole }) | null {
    const result = this.db
      .prepare('SELECT * FROM auth_info WHERE id = 1')
      .get() as any;

    if (!result) return null;

    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      tokenType: result.token_type,
      expiresIn: result.expires_in,
      userId: result.user_id,
      tenantId: result.tenant_id,
      account: result.account,
      userName: result.user_name,
      avatar: result.avatar,
      userRole: result.user_role as UserRole,
    };
  }

  /**
   * Update access token
   */
  updateAccessToken(accessToken: string, expiresIn: number): void {
    this.db
      .prepare(
        'UPDATE auth_info SET access_token = ?, expires_in = ?, updated_at = ? WHERE id = 1'
      )
      .run(accessToken, expiresIn, Date.now());
  }

  /**
   * Clear auth info
   */
  clearAuthInfo(): void {
    this.db.prepare('DELETE FROM auth_info WHERE id = 1').run();
  }

  /**
   * Save user info
   */
  saveUserInfo(user: UserInfo): void {
    const now = Date.now();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO user_info (
          id, account, name, real_name, avatar, email, phone,
          role_id, role_name, dept_id, post_id, tenant_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        user.id,
        user.account,
        user.name || null,
        user.realName || null,
        user.avatar || null,
        user.email || null,
        user.phone || null,
        user.roleId || null,
        user.roleName || null,
        user.deptId || null,
        user.postId || null,
        user.tenantId || null,
        now,
        now
      );
  }

  /**
   * Get user info
   */
  getUserInfo(): UserInfo | null {
    const result = this.db
      .prepare('SELECT * FROM user_info LIMIT 1')
      .get() as any;

    if (!result) return null;

    return {
      id: result.id,
      account: result.account,
      name: result.name,
      realName: result.real_name,
      avatar: result.avatar,
      email: result.email,
      phone: result.phone,
      roleId: result.role_id,
      roleName: result.role_name,
      deptId: result.dept_id,
      postId: result.post_id,
      tenantId: result.tenant_id,
    };
  }

  /**
   * Save membership info
   */
  saveMembershipInfo(membership: MembershipInfo): void {
    const now = Date.now();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO membership_info (
          id, level, expire_time, max_devices, features,
          created_at, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        membership.level,
        membership.expireTime || null,
        membership.maxDevices,
        JSON.stringify(membership.features),
        now,
        now
      );
  }

  /**
   * Get membership info
   */
  getMembershipInfo(): MembershipInfo | null {
    const result = this.db
      .prepare('SELECT * FROM membership_info WHERE id = 1')
      .get() as any;

    if (!result) return null;

    return {
      level: result.level,
      expireTime: result.expire_time,
      maxDevices: result.max_devices,
      features: JSON.parse(result.features || '[]'),
    };
  }

  /**
   * Clear all auth data
   */
  clearAll(): void {
    this.db.prepare('DELETE FROM auth_info').run();
    this.db.prepare('DELETE FROM user_info').run();
    this.db.prepare('DELETE FROM membership_info').run();
  }
}
