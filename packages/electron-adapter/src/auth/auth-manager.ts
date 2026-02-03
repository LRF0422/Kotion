import EventEmitter from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import { AuthRepository } from '../database/auth-repository';
import { AuthApi } from '../http/auth-api';
import {
  AuthInfo,
  LoginCredentials,
  UserInfo,
  MembershipInfo,
  UserRole,
  MembershipLevel,
} from '../types';

export interface AuthManagerEvents {
  'auth:login': (auth: AuthInfo) => void;
  'auth:logout': () => void;
  'auth:expired': () => void;
  'auth:refreshed': (token: string) => void;
  'membership:changed': (membership: MembershipInfo) => void;
}

export class AuthManager extends EventEmitter<AuthManagerEvents> {
  private deviceId: string | null = null;
  private authRepository: AuthRepository;
  private authApi: AuthApi;

  constructor(authRepository: AuthRepository, authApi: AuthApi) {
    super();
    this.authRepository = authRepository;
    this.authApi = authApi;
  }

  /**
   * Initialize - get or create device ID
   */
  async initialize(): Promise<void> {
    this.deviceId = await this.getOrCreateDeviceId();
  }

  /**
   * Anonymous login (desktop first launch)
   */
  async loginAsAnonymous(): Promise<AuthInfo> {
    if (!this.deviceId) {
      this.deviceId = await this.getOrCreateDeviceId();
    }

    const deviceName = os.hostname();
    
    try {
      const authInfo = await this.authApi.anonymousLogin({
        deviceId: this.deviceId,
        deviceName,
      });

      await this.saveAuthInfo(authInfo, UserRole.ANONYMOUS);
      this.emit('auth:login', authInfo);
      
      return authInfo;
    } catch (error) {
      console.error('Anonymous login failed:', error);
      throw error;
    }
  }

  /**
   * Login with password
   */
  async loginWithPassword(credentials: LoginCredentials): Promise<AuthInfo> {
    try {
      const authInfo = await this.authApi.login(credentials);
      
      await this.saveAuthInfo(authInfo, UserRole.AUTHENTICATED);
      
      // Fetch user info and membership in parallel
      await Promise.all([
        this.fetchAndSaveUserInfo(),
        this.fetchAndSaveMembership(),
      ]);

      // Try to bind device if authenticated
      if (this.deviceId) {
        await this.bindDeviceIfNeeded().catch((err) => {
          console.warn('Failed to bind device:', err);
        });
      }

      this.emit('auth:login', authInfo);
      
      return authInfo;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }

  /**
   * Refresh token
   */
  async refreshToken(): Promise<boolean> {
    try {
      const authInfo = this.authRepository.getAuthInfo();
      if (!authInfo?.refreshToken) {
        return false;
      }

      const newAuthInfo = await this.authApi.refreshToken(authInfo.refreshToken);
      
      // Update tokens
      this.authRepository.updateAccessToken(
        newAuthInfo.accessToken,
        newAuthInfo.expiresIn
      );

      this.emit('auth:refreshed', newAuthInfo.accessToken);
      
      return true;
    } catch (error) {
      console.error('Refresh token failed:', error);
      this.emit('auth:expired');
      return false;
    }
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    this.authRepository.clearAll();
    this.emit('auth:logout');
  }

  /**
   * Get current auth info
   */
  getAuthInfo(): (AuthInfo & { userRole: UserRole }) | null {
    return this.authRepository.getAuthInfo();
  }

  /**
   * Get access token
   */
  getAccessToken(): string | null {
    const authInfo = this.authRepository.getAuthInfo();
    return authInfo?.accessToken || null;
  }

  /**
   * Get current user info
   */
  getUserInfo(): UserInfo | null {
    return this.authRepository.getUserInfo();
  }

  /**
   * Get membership info
   */
  getMembership(): MembershipInfo | null {
    return this.authRepository.getMembershipInfo();
  }

  /**
   * Check if user is logged in
   */
  isLoggedIn(): boolean {
    const authInfo = this.getAuthInfo();
    return authInfo !== null && authInfo.userRole !== UserRole.ANONYMOUS;
  }

  /**
   * Check if user is anonymous
   */
  isAnonymous(): boolean {
    const authInfo = this.getAuthInfo();
    return authInfo !== null && authInfo.userRole === UserRole.ANONYMOUS;
  }

  /**
   * Check if user is member
   */
  isMember(): boolean {
    const membership = this.getMembership();
    if (!membership) return false;

    if (membership.level === MembershipLevel.FREE) return false;

    // Check expiration
    if (membership.expireTime && membership.expireTime < Date.now()) {
      return false;
    }

    return true;
  }

  /**
   * Get user role
   */
  getUserRole(): UserRole {
    const authInfo = this.getAuthInfo();
    return authInfo?.userRole || UserRole.ANONYMOUS;
  }

  /**
   * Update password
   */
  async updatePassword(
    oldPassword: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<void> {
    await this.authApi.updatePassword(oldPassword, newPassword, confirmPassword);
  }

  /**
   * Register new user
   */
  async register(data: {
    account: string;
    password: string;
    name?: string;
    email?: string;
    phone?: string;
  }): Promise<void> {
    await this.authApi.register(data);
  }

  /**
   * Fetch and save user info from server
   */
  async fetchAndSaveUserInfo(): Promise<UserInfo> {
    const userInfo = await this.authApi.getCurrentUser();
    this.authRepository.saveUserInfo(userInfo);
    return userInfo;
  }

  /**
   * Fetch and save membership info from server
   */
  async fetchAndSaveMembership(): Promise<MembershipInfo> {
    try {
      const membership = await this.authApi.getMembership();
      this.authRepository.saveMembershipInfo(membership);
      this.emit('membership:changed', membership);
      return membership;
    } catch (error) {
      // Membership endpoint might not exist yet
      console.warn('Failed to fetch membership:', error);
      
      // Save default free membership
      const defaultMembership: MembershipInfo = {
        level: MembershipLevel.FREE,
        maxDevices: 1,
        features: [],
      };
      this.authRepository.saveMembershipInfo(defaultMembership);
      return defaultMembership;
    }
  }

  /**
   * Get device ID
   */
  getDeviceId(): string | null {
    return this.deviceId;
  }

  /**
   * Private: Save auth info to database
   */
  private async saveAuthInfo(
    authInfo: AuthInfo,
    role: UserRole
  ): Promise<void> {
    this.authRepository.saveAuthInfo(authInfo, role);
  }

  /**
   * Private: Get or create device ID
   */
  private async getOrCreateDeviceId(): Promise<string> {
    const fs = await import('fs-extra');
    const path = await import('path');
    const { app } = await import('electron');
    
    const userDataPath = app.getPath('userData');
    const deviceIdPath = path.join(userDataPath, 'device-id');

    try {
      if (await fs.pathExists(deviceIdPath)) {
        return await fs.readFile(deviceIdPath, 'utf-8');
      }
    } catch (error) {
      console.warn('Failed to read device ID:', error);
    }

    // Generate new device ID
    const newDeviceId = uuidv4();
    await fs.writeFile(deviceIdPath, newDeviceId, 'utf-8');
    return newDeviceId;
  }

  /**
   * Private: Bind device to user account
   */
  private async bindDeviceIfNeeded(): Promise<void> {
    if (!this.deviceId) return;

    const platform = os.platform();
    const deviceName = os.hostname();

    await this.authApi.bindDevice({
      deviceId: this.deviceId,
      deviceName,
      platform,
    });
  }
}
