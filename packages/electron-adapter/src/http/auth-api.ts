import { HttpClient } from './client';
import {
  AuthInfo,
  LoginCredentials,
  AnonymousLoginParams,
  UserInfo,
  MembershipInfo,
  DeviceInfo,
} from '../types';

export class AuthApi {
  constructor(private http: HttpClient) { }

  /**
   * Anonymous login (desktop first launch)
   */
  async anonymousLogin(params: AnonymousLoginParams): Promise<AuthInfo> {
    return this.http.post<AuthInfo>('/knowledge-auth/anonymous', params);
  }

  /**
   * Login with password
   */
  async login(credentials: LoginCredentials): Promise<AuthInfo> {
    const params = new URLSearchParams();
    params.append('grantType', 'password');
    params.append('account', credentials.account);
    params.append('password', credentials.password);

    if (credentials.tenantId) {
      params.append('tenantId', credentials.tenantId);
    }

    return this.http.post<AuthInfo>(
      '/knowledge-auth/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
  }

  /**
   * Refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthInfo> {
    const params = new URLSearchParams();
    params.append('grantType', 'refresh_token');
    params.append('refreshToken', refreshToken);

    return this.http.post<AuthInfo>(
      '/knowledge-auth/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
  }

  /**
   * Get captcha
   */
  async getCaptcha(): Promise<{ key: string; image: string }> {
    return this.http.get<{ key: string; image: string }>(
      '/knowledge-auth/captcha'
    );
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<UserInfo> {
    return this.http.get<UserInfo>('/knowledge-system/user/info');
  }

  /**
   * Get membership info
   */
  async getMembership(): Promise<MembershipInfo> {
    return this.http.get<MembershipInfo>('/knowledge-system/user/membership');
  }

  /**
   * Update password
   */
  async updatePassword(
    oldPassword: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<void> {
    return this.http.post('/knowledge-system/user/update-password', null, {
      params: {
        oldPassword,
        newPassword,
        newPassword1: confirmPassword,
      },
    });
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
    return this.http.post('/knowledge-system/user/register', data);
  }

  /**
   * Bind device (requires backend implementation)
   */
  async bindDevice(params: {
    deviceId: string;
    deviceName: string;
    platform: string;
  }): Promise<void> {
    return this.http.post('/knowledge-system/user/device/bind', params);
  }

  /**
   * Get device list (requires backend implementation)
   */
  async getDevices(): Promise<DeviceInfo[]> {
    return this.http.get<DeviceInfo[]>('/knowledge-system/user/device/list');
  }

  /**
   * Unbind device (requires backend implementation)
   */
  async unbindDevice(deviceId: string): Promise<void> {
    return this.http.delete(`/knowledge-system/user/device/${deviceId}`);
  }
}
