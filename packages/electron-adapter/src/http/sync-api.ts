import { HttpClient } from './client';
import { SyncChange, SyncConflict } from '../types';

export interface SyncChangesResponse {
  spaces: any[];
  pages: any[];
  plugins: any[];
  timestamp: number;
}

export interface ConflictResolutionDTO {
  type: 'space' | 'page';
  entityId: number;
  resolution: 'use_local' | 'use_remote' | 'merge';
  mergedData?: any;
}

export class SyncApi {
  constructor(private http: HttpClient) {}

  /**
   * Sync spaces to cloud (requires backend implementation)
   */
  async syncSpaces(spaces: any[]): Promise<void> {
    return this.http.post('/knowledge-sync/spaces', spaces);
  }

  /**
   * Sync pages to cloud (requires backend implementation)
   */
  async syncPages(pages: any[]): Promise<void> {
    return this.http.post('/knowledge-sync/pages', pages);
  }

  /**
   * Get changes from server (requires backend implementation)
   */
  async getChanges(
    since: number,
    deviceId?: string
  ): Promise<SyncChangesResponse> {
    return this.http.get<SyncChangesResponse>('/knowledge-sync/changes', {
      since,
      deviceId,
    });
  }

  /**
   * Resolve sync conflict (requires backend implementation)
   */
  async resolveConflict(dto: ConflictResolutionDTO): Promise<void> {
    return this.http.post('/knowledge-sync/resolve-conflict', dto);
  }

  /**
   * Upload plugin installation record (requires backend implementation)
   */
  async syncPluginInstallation(pluginIds: number[]): Promise<void> {
    return this.http.post('/knowledge-sync/plugins', { pluginIds });
  }
}
