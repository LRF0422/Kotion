import { InstalledPlugin } from '../types';

export class PluginRepository {
  constructor(private db: any) { }

  /**
   * Install plugin
   */
  install(plugin: Omit<InstalledPlugin, 'installedAt'>): void {
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO plugins (
          id, name, version, category, is_premium,
          cloud_id, file_path, enabled, installed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        plugin.id || `${plugin.pluginId}-${plugin.version}`,
        plugin.name,
        plugin.version,
        plugin.category,
        plugin.isPremium ? 1 : 0,
        plugin.cloudId || null,
        plugin.filePath,
        plugin.enabled ? 1 : 0,
        now
      );
  }

  /**
   * Get installed plugin
   */
  getById(id: string): InstalledPlugin | null {
    const result = this.db
      .prepare('SELECT * FROM plugins WHERE id = ?')
      .get(id) as any;

    return result ? this.mapToPlugin(result) : null;
  }

  /**
   * Get all installed plugins
   */
  getAll(): InstalledPlugin[] {
    const results = this.db
      .prepare('SELECT * FROM plugins ORDER BY installed_at DESC')
      .all() as any[];

    return results.map((r) => this.mapToPlugin(r));
  }

  /**
   * Get enabled plugins
   */
  getEnabled(): InstalledPlugin[] {
    const results = this.db
      .prepare('SELECT * FROM plugins WHERE enabled = 1 ORDER BY installed_at DESC')
      .all() as any[];

    return results.map((r) => this.mapToPlugin(r));
  }

  /**
   * Get plugins by category
   */
  getByCategory(category: string): InstalledPlugin[] {
    const results = this.db
      .prepare('SELECT * FROM plugins WHERE category = ? ORDER BY installed_at DESC')
      .all(category) as any[];

    return results.map((r) => this.mapToPlugin(r));
  }

  /**
   * Check if plugin is installed
   */
  isInstalled(pluginId: number, version: string): boolean {
    const result = this.db
      .prepare('SELECT COUNT(*) as count FROM plugins WHERE cloud_id = ? AND version = ?')
      .get(pluginId, version) as { count: number };

    return result.count > 0;
  }

  /**
   * Update plugin enabled status
   */
  setEnabled(id: string, enabled: boolean): void {
    this.db
      .prepare('UPDATE plugins SET enabled = ? WHERE id = ?')
      .run(enabled ? 1 : 0, id);
  }

  /**
   * Uninstall plugin
   */
  uninstall(id: string): void {
    this.db.prepare('DELETE FROM plugins WHERE id = ?').run(id);
  }

  /**
   * Cache plugin file metadata
   */
  cachePlugin(cache: {
    pluginId: string;
    version: string;
    fileHash: string;
    fileSize: number;
    filePath: string;
    downloadUrl?: string;
  }): void {
    const now = Date.now();

    this.db
      .prepare(
        `INSERT OR REPLACE INTO plugin_cache (
          plugin_id, version, file_hash, file_size, file_path,
          download_url, cached_at, last_verified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        cache.pluginId,
        cache.version,
        cache.fileHash,
        cache.fileSize,
        cache.filePath,
        cache.downloadUrl || null,
        now,
        now
      );
  }

  /**
   * Get cached plugin
   */
  getCachedPlugin(pluginId: string, version: string): any | null {
    return this.db
      .prepare('SELECT * FROM plugin_cache WHERE plugin_id = ? AND version = ?')
      .get(pluginId, version) as any;
  }

  /**
   * Remove plugin cache
   */
  removeCache(pluginId: string, version: string): void {
    this.db
      .prepare('DELETE FROM plugin_cache WHERE plugin_id = ? AND version = ?')
      .run(pluginId, version);
  }

  /**
   * Verify plugin cache
   */
  updateCacheVerification(pluginId: string, version: string): void {
    this.db
      .prepare(
        'UPDATE plugin_cache SET last_verified = ? WHERE plugin_id = ? AND version = ?'
      )
      .run(Date.now(), pluginId, version);
  }

  private mapToPlugin(row: any): InstalledPlugin {
    return {
      id: row.id,
      pluginId: row.cloud_id,
      name: row.name,
      version: row.version,
      category: row.category,
      isPremium: row.is_premium === 1,
      cloudId: row.cloud_id,
      filePath: row.file_path,
      enabled: row.enabled === 1,
      installedAt: row.installed_at,
    };
  }
}
