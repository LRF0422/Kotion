import { DB_SCHEMA_VERSION } from '../config';
import * as path from 'path';
import * as fs from 'fs-extra';

export class DatabaseManager {
  private db: any;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    fs.ensureDirSync(dir);
  }

  private initSchema() {
    const currentVersion = this.getSchemaVersion();

    if (currentVersion === 0) {
      // Fresh database, create all tables
      this.createTables();
      this.setSchemaVersion(DB_SCHEMA_VERSION);
    } else if (currentVersion < DB_SCHEMA_VERSION) {
      // Migration needed
      this.migrate(currentVersion, DB_SCHEMA_VERSION);
    }
  }

  private createTables() {
    this.db.exec(`
      -- Schema version table
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );

      -- Auth info table
      CREATE TABLE IF NOT EXISTS auth_info (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        token_type TEXT NOT NULL,
        expires_in INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        tenant_id TEXT,
        account TEXT NOT NULL,
        user_name TEXT,
        avatar TEXT,
        user_role TEXT NOT NULL DEFAULT 'anonymous',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- User info table
      CREATE TABLE IF NOT EXISTS user_info (
        id INTEGER PRIMARY KEY,
        account TEXT NOT NULL,
        name TEXT,
        real_name TEXT,
        avatar TEXT,
        email TEXT,
        phone TEXT,
        role_id TEXT,
        role_name TEXT,
        dept_id INTEGER,
        post_id INTEGER,
        tenant_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Membership info table
      CREATE TABLE IF NOT EXISTS membership_info (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        level TEXT NOT NULL DEFAULT 'free',
        expire_time INTEGER,
        max_devices INTEGER NOT NULL DEFAULT 1,
        features TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Device info table
      CREATE TABLE IF NOT EXISTS device_info (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL UNIQUE,
        device_name TEXT NOT NULL,
        platform TEXT NOT NULL,
        last_sync_time INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Spaces table
      CREATE TABLE IF NOT EXISTS spaces (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        icon TEXT,
        is_public INTEGER NOT NULL DEFAULT 0,
        is_template INTEGER NOT NULL DEFAULT 0,
        creator_id INTEGER NOT NULL,
        local_only INTEGER NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_spaces_creator ON spaces(creator_id);
      CREATE INDEX IF NOT EXISTS idx_spaces_sync ON spaces(sync_status);

      -- Pages table
      CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY,
        space_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        parent_id INTEGER,
        icon TEXT,
        cover TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        creator_id INTEGER NOT NULL,
        local_only INTEGER NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES pages(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_pages_space ON pages(space_id);
      CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(parent_id);
      CREATE INDEX IF NOT EXISTS idx_pages_creator ON pages(creator_id);
      CREATE INDEX IF NOT EXISTS idx_pages_sync ON pages(sync_status);
      CREATE INDEX IF NOT EXISTS idx_pages_updated ON pages(updated_at);

      -- Page blocks table
      CREATE TABLE IF NOT EXISTS page_blocks (
        id TEXT PRIMARY KEY,
        page_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        content TEXT,
        properties TEXT,
        parent_id TEXT,
        block_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_blocks_page ON page_blocks(page_id);
      CREATE INDEX IF NOT EXISTS idx_blocks_parent ON page_blocks(parent_id);

      -- Plugins table
      CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        category TEXT NOT NULL,
        is_premium INTEGER NOT NULL DEFAULT 0,
        installed_at INTEGER NOT NULL,
        cloud_id INTEGER,
        file_path TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        UNIQUE(cloud_id, version)
      );

      CREATE INDEX IF NOT EXISTS idx_plugins_category ON plugins(category);
      CREATE INDEX IF NOT EXISTS idx_plugins_cloud ON plugins(cloud_id);

      -- Plugin cache table
      CREATE TABLE IF NOT EXISTS plugin_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_id TEXT NOT NULL,
        version TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        download_url TEXT,
        cached_at INTEGER NOT NULL,
        last_verified INTEGER NOT NULL,
        UNIQUE(plugin_id, version)
      );

      CREATE INDEX IF NOT EXISTS idx_cache_plugin ON plugin_cache(plugin_id);

      -- Files table
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_id INTEGER,
        repo_key TEXT,
        path TEXT NOT NULL,
        size INTEGER,
        mime_type TEXT,
        creator_id INTEGER NOT NULL,
        local_only INTEGER NOT NULL DEFAULT 0,
        sync_status TEXT NOT NULL DEFAULT 'synced',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (parent_id) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_id);
      CREATE INDEX IF NOT EXISTS idx_files_repo ON files(repo_key);
      CREATE INDEX IF NOT EXISTS idx_files_type ON files(type);

      -- Sync queue table
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        synced_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced_at);

      -- Sync conflicts table
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        local_data TEXT NOT NULL,
        remote_data TEXT NOT NULL,
        local_timestamp INTEGER NOT NULL,
        remote_timestamp INTEGER NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conflicts_resolved ON sync_conflicts(resolved);

      -- Settings table
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Favorites table
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(entity_type, entity_id)
      );

      CREATE INDEX IF NOT EXISTS idx_favorites_type ON favorites(entity_type);

      -- Recent access table
      CREATE TABLE IF NOT EXISTS recent_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_recent_type ON recent_access(entity_type);
      CREATE INDEX IF NOT EXISTS idx_recent_accessed ON recent_access(accessed_at);
    `);
  }

  private getSchemaVersion(): number {
    try {
      const result = this.db
        .prepare('SELECT version FROM schema_version LIMIT 1')
        .get() as { version: number } | undefined;
      return result?.version || 0;
    } catch {
      return 0;
    }
  }

  private setSchemaVersion(version: number): void {
    this.db
      .prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)')
      .run(version);
  }

  private migrate(fromVersion: number, toVersion: number): void {
    console.log(`Migrating database from version ${fromVersion} to ${toVersion}`);

    // Add migration logic here when schema changes
    // For now, we only have version 1

    this.setSchemaVersion(toVersion);
  }

  /**
   * Get database instance
   */
  getDatabase(): any {
    return this.db;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Execute in transaction
   */
  transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  /**
   * Backup database
   */
  async backup(backupPath: string): Promise<void> {
    await fs.ensureDir(path.dirname(backupPath));
    await this.db.backup(backupPath);
  }

  /**
   * Vacuum database
   */
  vacuum(): void {
    this.db.exec('VACUUM');
  }

  /**
   * Get database statistics
   */
  getStats() {
    const tables = [
      'spaces',
      'pages',
      'page_blocks',
      'plugins',
      'files',
      'sync_queue',
      'sync_conflicts',
    ];

    const stats: Record<string, number> = {};

    for (const table of tables) {
      const result = this.db
        .prepare(`SELECT COUNT(*) as count FROM ${table}`)
        .get() as { count: number };
      stats[table] = result.count;
    }

    return stats;
  }
}
