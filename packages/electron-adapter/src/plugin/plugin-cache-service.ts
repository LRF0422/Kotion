import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { PluginApi } from '../http/plugin-api';

export interface CachedPluginInfo {
  pluginId: string;
  version: string;
  filePath: string;
  fileHash: string;
  fileSize: number;
  cachedAt: number;
}

export class PluginCacheService {
  constructor(
    private cacheDir: string,
    private pluginApi: PluginApi
  ) {}

  /**
   * Initialize cache directory
   */
  async initialize(): Promise<void> {
    await fs.ensureDir(this.cacheDir);
  }

  /**
   * Download and cache plugin
   */
  async cachePlugin(
    versionId: number,
    pluginId: string,
    version: string,
    onProgress?: (progress: number) => void
  ): Promise<CachedPluginInfo> {
    const pluginDir = path.join(this.cacheDir, pluginId, version);
    await fs.ensureDir(pluginDir);

    const fileName = 'index.js';
    const filePath = path.join(pluginDir, fileName);

    // Download plugin file
    await this.pluginApi.downloadPluginToFile(versionId, filePath, onProgress);

    // Calculate hash
    const fileHash = await this.calculateFileHash(filePath);
    const stats = await fs.stat(filePath);

    return {
      pluginId,
      version,
      filePath,
      fileHash,
      fileSize: stats.size,
      cachedAt: Date.now(),
    };
  }

  /**
   * Load plugin from cache
   */
  async loadPluginFromCache(
    pluginId: string,
    version: string
  ): Promise<string> {
    const pluginDir = path.join(this.cacheDir, pluginId, version);
    const filePath = path.join(pluginDir, 'index.js');

    if (!(await fs.pathExists(filePath))) {
      throw new Error(`Plugin ${pluginId}@${version} not found in cache`);
    }

    return filePath;
  }

  /**
   * Verify cached plugin
   */
  async verifyCache(
    pluginId: string,
    version: string,
    expectedHash: string
  ): Promise<boolean> {
    try {
      const filePath = await this.loadPluginFromCache(pluginId, version);
      const actualHash = await this.calculateFileHash(filePath);
      return actualHash === expectedHash;
    } catch {
      return false;
    }
  }

  /**
   * Remove plugin from cache
   */
  async removePluginCache(pluginId: string, version: string): Promise<void> {
    const pluginDir = path.join(this.cacheDir, pluginId, version);
    await fs.remove(pluginDir);
  }

  /**
   * Clear all cache
   */
  async clearAllCache(): Promise<void> {
    await fs.emptyDir(this.cacheDir);
  }

  /**
   * Get cache size
   */
  async getCacheSize(): Promise<number> {
    let totalSize = 0;
    
    const walk = async (dir: string) => {
      const files = await fs.readdir(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.stat(filePath);
        
        if (stat.isDirectory()) {
          await walk(filePath);
        } else {
          totalSize += stat.size;
        }
      }
    };

    await walk(this.cacheDir);
    return totalSize;
  }

  /**
   * Calculate file hash (SHA-256)
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}
