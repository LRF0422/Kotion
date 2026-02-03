import { HttpClient } from './client';
import {
  Plugin,
  PluginDTO,
  PluginVersion,
  InstalledPlugin,
  QueryPluginDTO,
  PageResult,
} from '../types';

export class PluginApi {
  constructor(private http: HttpClient) {}

  /**
   * Create plugin
   */
  async createPlugin(dto: PluginDTO): Promise<void> {
    return this.http.post('/knowledge-wiki/plugin', dto);
  }

  /**
   * Search plugins
   */
  async searchPlugins(dto: QueryPluginDTO): Promise<PageResult<Plugin>> {
    return this.http.get<PageResult<Plugin>>('/knowledge-wiki/plugin/public', dto);
  }

  /**
   * Get plugin detail
   */
  async getPluginDetail(id: number): Promise<Plugin> {
    return this.http.get<Plugin>(`/knowledge-wiki/plugin/${id}`);
  }

  /**
   * Install plugin
   */
  async installPlugin(versionId: number): Promise<void> {
    return this.http.post('/knowledge-wiki/plugin/install', null, {
      params: { versionId },
    } as any);
  }

  /**
   * Uninstall plugin
   */
  async uninstallPlugin(versionId: number): Promise<void> {
    return this.http.post('/knowledge-wiki/plugin/uninstall', null, {
      params: { versionId },
    } as any);
  }

  /**
   * Update plugin
   */
  async updatePlugin(versionId: number): Promise<void> {
    return this.http.post('/knowledge-wiki/plugin/update', null, {
      params: { versionId },
    } as any);
  }

  /**
   * Get installed plugins
   */
  async getInstalledPlugins(): Promise<InstalledPlugin[]> {
    return this.http.get<InstalledPlugin[]>('/knowledge-wiki/plugin/install/list');
  }

  /**
   * Download plugin file (requires backend implementation)
   * Returns the file as ArrayBuffer
   */
  async downloadPlugin(versionId: number): Promise<ArrayBuffer> {
    const response = await this.http.getRawClient().get(
      `/knowledge-wiki/plugin/${versionId}/download`,
      { responseType: 'arraybuffer' }
    );
    return response.data;
  }

  /**
   * Get plugin file hash (requires backend implementation)
   */
  async getPluginHash(versionId: number): Promise<string> {
    return this.http.get<string>(`/knowledge-wiki/plugin/${versionId}/hash`);
  }

  /**
   * Download plugin to file path
   */
  async downloadPluginToFile(
    versionId: number,
    savePath: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const url = `/knowledge-wiki/plugin/${versionId}/download`;
    
    if (onProgress) {
      await this.http.downloadWithProgress(url, savePath, onProgress);
    } else {
      await this.http.downloadFile(url, savePath);
    }
  }
}
