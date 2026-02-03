import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import EventEmitter from 'eventemitter3';
import { ApiResponse, ApiConfig } from '../types';

export interface HttpClientEvents {
  'auth:expired': () => void;
  'request:error': (error: Error) => void;
  'token:refreshed': (token: string) => void;
}

export class HttpClient extends EventEmitter<HttpClientEvents> {
  private client: AxiosInstance;
  private tokenGetter: (() => string | null) | null = null;
  private tokenSetter: ((token: string) => void) | null = null;
  private refreshTokenFn: (() => Promise<boolean>) | null = null;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value?: any) => void;
    reject: (reason?: any) => void;
  }> = [];

  constructor(config: ApiConfig) {
    super();
    
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Set token getter/setter for automatic token injection
   */
  setTokenHandlers(
    getter: () => string | null,
    setter: (token: string) => void
  ) {
    this.tokenGetter = getter;
    this.tokenSetter = setter;
  }

  /**
   * Set refresh token function
   */
  setRefreshTokenHandler(fn: () => Promise<boolean>) {
    this.refreshTokenFn = fn;
  }

  private setupInterceptors() {
    // Request interceptor - auto inject token
    this.client.interceptors.request.use(
      (config) => {
        if (this.tokenGetter) {
          const token = this.tokenGetter();
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - handle 401 and token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & {
          _retry?: boolean;
        };

        // Handle 401 unauthorized
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            // If already refreshing, queue this request
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            })
              .then(() => {
                return this.client(originalRequest);
              })
              .catch((err) => {
                return Promise.reject(err);
              });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            if (this.refreshTokenFn) {
              const refreshed = await this.refreshTokenFn();

              if (refreshed) {
                // Retry all queued requests
                this.failedQueue.forEach(({ resolve }) => {
                  resolve();
                });
                this.failedQueue = [];
                this.isRefreshing = false;

                // Retry original request
                return this.client(originalRequest);
              }
            }

            // Refresh failed or no refresh handler
            this.emit('auth:expired');
            this.isRefreshing = false;
            return Promise.reject(error);
          } catch (refreshError) {
            // Refresh failed
            this.failedQueue.forEach(({ reject }) => {
              reject(refreshError);
            });
            this.failedQueue = [];
            this.isRefreshing = false;
            this.emit('auth:expired');
            return Promise.reject(refreshError);
          }
        }

        // Emit error event
        this.emit('request:error', error as Error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * GET request
   */
  async get<T = any>(url: string, params?: any): Promise<T> {
    const response = await this.client.get<ApiResponse<T>>(url, { params });
    return this.unwrapResponse(response.data);
  }

  /**
   * POST request
   */
  async post<T = any>(url: string, data?: any): Promise<T> {
    const response = await this.client.post<ApiResponse<T>>(url, data);
    return this.unwrapResponse(response.data);
  }

  /**
   * PUT request
   */
  async put<T = any>(url: string, data?: any): Promise<T> {
    const response = await this.client.put<ApiResponse<T>>(url, data);
    return this.unwrapResponse(response.data);
  }

  /**
   * DELETE request
   */
  async delete<T = any>(url: string): Promise<T> {
    const response = await this.client.delete<ApiResponse<T>>(url);
    return this.unwrapResponse(response.data);
  }

  /**
   * Download file
   */
  async downloadFile(url: string, savePath: string): Promise<void> {
    const fs = await import('fs-extra');
    const response = await this.client.get(url, {
      responseType: 'arraybuffer',
    });

    await fs.writeFile(savePath, response.data);
  }

  /**
   * Download with progress callback
   */
  async downloadWithProgress(
    url: string,
    savePath: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const fs = await import('fs-extra');
    
    const response = await this.client.get(url, {
      responseType: 'stream',
      onDownloadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          onProgress(progress);
        }
      },
    });

    const writer = fs.createWriteStream(savePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  /**
   * Unwrap API response
   */
  private unwrapResponse<T>(response: ApiResponse<T>): T {
    if (response.code === 200) {
      return response.data;
    }
    throw new Error(response.msg || 'Request failed');
  }

  /**
   * Get raw axios instance for custom requests
   */
  getRawClient(): AxiosInstance {
    return this.client;
  }
}
