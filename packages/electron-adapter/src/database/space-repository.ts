import Database from 'better-sqlite3';
import { Space, Page, SyncStatus } from '../types';

export class SpaceRepository {
  constructor(private db: Database.Database) { }

  /**
   * Create space
   */
  create(space: Omit<Space, 'id' | 'createdAt' | 'updatedAt'> & { id?: number }): number {
    const now = Date.now();

    const result = this.db
      .prepare(
        `INSERT INTO spaces (
          id, name, description, icon, is_public, is_template,
          creator_id, local_only, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        space.id || null,
        space.name,
        space.description || null,
        space.icon || null,
        space.isPublic ? 1 : 0,
        space.isTemplate ? 1 : 0,
        space.creatorId,
        space.localOnly ? 1 : 0,
        space.syncStatus || SyncStatus.SYNCED,
        now,
        now
      );

    return result.lastInsertRowid as number;
  }

  /**
   * Get space by ID
   */
  getById(id: number): Space | null {
    const result = this.db
      .prepare('SELECT * FROM spaces WHERE id = ? AND deleted_at IS NULL')
      .get(id) as any;

    return result ? this.mapToSpace(result) : null;
  }

  /**
   * Get all spaces
   */
  getAll(): Space[] {
    const results = this.db
      .prepare('SELECT * FROM spaces WHERE deleted_at IS NULL ORDER BY updated_at DESC')
      .all() as any[];

    return results.map((r) => this.mapToSpace(r));
  }

  /**
   * Update space
   */
  update(id: number, data: Partial<Space>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description);
    }
    if (data.icon !== undefined) {
      fields.push('icon = ?');
      values.push(data.icon);
    }
    if (data.isPublic !== undefined) {
      fields.push('is_public = ?');
      values.push(data.isPublic ? 1 : 0);
    }
    if (data.syncStatus !== undefined) {
      fields.push('sync_status = ?');
      values.push(data.syncStatus);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    this.db
      .prepare(`UPDATE spaces SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
  }

  /**
   * Delete space (soft delete)
   */
  delete(id: number): void {
    this.db
      .prepare('UPDATE spaces SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(Date.now(), Date.now(), id);
  }

  /**
   * Get unsynced spaces
   */
  getUnsynced(): Space[] {
    const results = this.db
      .prepare(
        `SELECT * FROM spaces 
         WHERE sync_status != ? AND deleted_at IS NULL 
         ORDER BY updated_at DESC`
      )
      .all(SyncStatus.SYNCED) as any[];

    return results.map((r) => this.mapToSpace(r));
  }

  /**
   * Add space to favorites
   */
  addFavorite(spaceId: number): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO favorites (entity_type, entity_id, created_at)
         VALUES ('space', ?, ?)`
      )
      .run(spaceId, now);
  }

  /**
   * Remove space from favorites
   */
  removeFavorite(spaceId: number): void {
    this.db
      .prepare('DELETE FROM favorites WHERE entity_type = ? AND entity_id = ?')
      .run('space', spaceId);
  }

  /**
   * Check if space is favorited
   */
  isFavorite(spaceId: number): boolean {
    const result = this.db
      .prepare('SELECT 1 FROM favorites WHERE entity_type = ? AND entity_id = ?')
      .get('space', spaceId);
    return !!result;
  }

  /**
   * Get all favorited spaces
   */
  getFavorites(): Space[] {
    const results = this.db
      .prepare(
        `SELECT s.* FROM spaces s
         INNER JOIN favorites f ON f.entity_id = s.id AND f.entity_type = 'space'
         WHERE s.deleted_at IS NULL
         ORDER BY f.created_at DESC`
      )
      .all() as any[];

    return results.map((r) => this.mapToSpace(r));
  }

  /**
   * Get templates
   */
  getTemplates(): Space[] {
    const results = this.db
      .prepare(
        `SELECT * FROM spaces
         WHERE is_template = 1 AND deleted_at IS NULL
         ORDER BY updated_at DESC`
      )
      .all() as any[];

    return results.map((r) => this.mapToSpace(r));
  }

  /**
   * Save space as template
   */
  saveAsTemplate(spaceId: number): void {
    this.db
      .prepare('UPDATE spaces SET is_template = 1, updated_at = ? WHERE id = ?')
      .run(Date.now(), spaceId);
  }

  private mapToSpace(row: any): Space {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      isPublic: row.is_public === 1,
      isTemplate: row.is_template === 1,
      creatorId: row.creator_id,
      localOnly: row.local_only === 1,
      syncStatus: row.sync_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export class PageRepository {
  constructor(private db: Database.Database) { }

  /**
   * Create page
   */
  create(page: Omit<Page, 'id' | 'createdAt' | 'updatedAt'> & { id?: number }): number {
    const now = Date.now();

    const result = this.db
      .prepare(
        `INSERT INTO pages (
          id, space_id, title, content, parent_id, icon, cover,
          is_deleted, creator_id, local_only, sync_status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        page.id || null,
        page.spaceId,
        page.title,
        page.content || null,
        page.parentId || null,
        page.icon || null,
        page.cover || null,
        page.isDeleted ? 1 : 0,
        page.creatorId,
        page.localOnly ? 1 : 0,
        page.syncStatus || SyncStatus.SYNCED,
        now,
        now
      );

    return result.lastInsertRowid as number;
  }

  /**
   * Get page by ID
   */
  getById(id: number): Page | null {
    const result = this.db
      .prepare('SELECT * FROM pages WHERE id = ?')
      .get(id) as any;

    return result ? this.mapToPage(result) : null;
  }

  /**
   * Get pages by space ID
   */
  getBySpaceId(spaceId: number): Page[] {
    const results = this.db
      .prepare(
        'SELECT * FROM pages WHERE space_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC'
      )
      .all(spaceId) as any[];

    return results.map((r) => this.mapToPage(r));
  }

  /**
   * Get page tree
   */
  getTree(spaceId: number): Page[] {
    const results = this.db
      .prepare(
        `SELECT * FROM pages 
         WHERE space_id = ? AND deleted_at IS NULL AND is_deleted = 0
         ORDER BY parent_id, created_at`
      )
      .all(spaceId) as any[];

    return results.map((r) => this.mapToPage(r));
  }

  /**
   * Get recent pages
   */
  getRecent(limit: number = 10): Page[] {
    const results = this.db
      .prepare(
        `SELECT p.* FROM pages p
         INNER JOIN recent_access ra ON p.id = ra.entity_id
         WHERE ra.entity_type = 'page' AND p.deleted_at IS NULL AND p.is_deleted = 0
         ORDER BY ra.accessed_at DESC
         LIMIT ?`
      )
      .all(limit) as any[];

    return results.map((r) => this.mapToPage(r));
  }

  /**
   * Update page
   */
  update(id: number, data: Partial<Page>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined) {
      fields.push('title = ?');
      values.push(data.title);
    }
    if (data.content !== undefined) {
      fields.push('content = ?');
      values.push(data.content);
    }
    if (data.parentId !== undefined) {
      fields.push('parent_id = ?');
      values.push(data.parentId);
    }
    if (data.icon !== undefined) {
      fields.push('icon = ?');
      values.push(data.icon);
    }
    if (data.cover !== undefined) {
      fields.push('cover = ?');
      values.push(data.cover);
    }
    if (data.isDeleted !== undefined) {
      fields.push('is_deleted = ?');
      values.push(data.isDeleted ? 1 : 0);
    }
    if (data.syncStatus !== undefined) {
      fields.push('sync_status = ?');
      values.push(data.syncStatus);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    this.db
      .prepare(`UPDATE pages SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
  }

  /**
   * Delete page (soft delete)
   */
  delete(id: number): void {
    this.db
      .prepare('UPDATE pages SET deleted_at = ?, updated_at = ?, is_deleted = 1 WHERE id = ?')
      .run(Date.now(), Date.now(), id);
  }

  /**
   * Restore page
   */
  restore(id: number): void {
    this.db
      .prepare('UPDATE pages SET deleted_at = NULL, updated_at = ?, is_deleted = 0 WHERE id = ?')
      .run(Date.now(), id);
  }

  /**
   * Record page access
   */
  recordAccess(pageId: number): void {
    this.db
      .prepare(
        'INSERT INTO recent_access (entity_type, entity_id, accessed_at) VALUES (?, ?, ?)'
      )
      .run('page', pageId, Date.now());

    // Keep only last 100 records
    this.db
      .prepare(
        `DELETE FROM recent_access 
         WHERE entity_type = 'page' AND id NOT IN (
           SELECT id FROM recent_access 
           WHERE entity_type = 'page' 
           ORDER BY accessed_at DESC 
           LIMIT 100
         )`
      )
      .run();
  }

  /**
   * Get unsynced pages
   */
  getUnsynced(): Page[] {
    const results = this.db
      .prepare(
        `SELECT * FROM pages 
         WHERE sync_status != ? 
         ORDER BY updated_at DESC`
      )
      .all(SyncStatus.SYNCED) as any[];

    return results.map((r) => this.mapToPage(r));
  }

  /**
   * Add page to favorites
   */
  addFavorite(pageId: number): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO favorites (entity_type, entity_id, created_at)
         VALUES ('page', ?, ?)`
      )
      .run(pageId, now);
  }

  /**
   * Remove page from favorites
   */
  removeFavorite(pageId: number): void {
    this.db
      .prepare('DELETE FROM favorites WHERE entity_type = ? AND entity_id = ?')
      .run('page', pageId);
  }

  /**
   * Check if page is favorited
   */
  isFavorite(pageId: number): boolean {
    const result = this.db
      .prepare('SELECT 1 FROM favorites WHERE entity_type = ? AND entity_id = ?')
      .get('page', pageId);
    return !!result;
  }

  /**
   * Get all favorited pages
   */
  getFavorites(): Page[] {
    const results = this.db
      .prepare(
        `SELECT p.* FROM pages p
         INNER JOIN favorites f ON f.entity_id = p.id AND f.entity_type = 'page'
         WHERE p.deleted_at IS NULL AND p.is_deleted = 0
         ORDER BY f.created_at DESC`
      )
      .all() as any[];

    return results.map((r) => this.mapToPage(r));
  }

  /**
   * Get page templates
   */
  getTemplates(): Page[] {
    const results = this.db
      .prepare(
        `SELECT p.* FROM pages p
         INNER JOIN spaces s ON s.id = p.space_id
         WHERE s.is_template = 1 AND p.deleted_at IS NULL AND p.is_deleted = 0
         ORDER BY p.updated_at DESC`
      )
      .all() as any[];

    return results.map((r) => this.mapToPage(r));
  }

  /**
   * Save page as template (by marking its space as template)
   */
  saveAsTemplate(pageId: number): void {
    const page = this.getById(pageId);
    if (page) {
      // Mark the space as template
      this.db
        .prepare('UPDATE spaces SET is_template = 1, updated_at = ? WHERE id = ?')
        .run(Date.now(), page.spaceId);
    }
  }

  /**
   * Create page block
   */
  createBlock(block: {
    id: string;
    pageId: number;
    type: string;
    content?: any;
    properties?: Record<string, any>;
    parentId?: string;
    order?: number;
  }): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO page_blocks (id, page_id, type, content, properties, parent_id, block_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        block.id,
        block.pageId,
        block.type,
        block.content ? JSON.stringify(block.content) : null,
        block.properties ? JSON.stringify(block.properties) : null,
        block.parentId || null,
        block.order || 0,
        now,
        now
      );
  }

  /**
   * Get blocks by page ID
   */
  getBlocks(pageId: number): any[] {
    const results = this.db
      .prepare(
        `SELECT * FROM page_blocks
         WHERE page_id = ?
         ORDER BY block_order`
      )
      .all(pageId) as any[];

    return results.map((r) => this.mapToBlock(r));
  }

  /**
   * Get block by ID
   */
  getBlockById(blockId: string): any | null {
    const result = this.db
      .prepare('SELECT * FROM page_blocks WHERE id = ?')
      .get(blockId) as any;

    return result ? this.mapToBlock(result) : null;
  }

  /**
   * Update block
   */
  updateBlock(blockId: string, data: Partial<{
    type: string;
    content: any;
    properties: Record<string, any>;
    parentId: string;
    order: number;
  }>): void {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.type !== undefined) {
      fields.push('type = ?');
      values.push(data.type);
    }
    if (data.content !== undefined) {
      fields.push('content = ?');
      values.push(JSON.stringify(data.content));
    }
    if (data.properties !== undefined) {
      fields.push('properties = ?');
      values.push(JSON.stringify(data.properties));
    }
    if (data.parentId !== undefined) {
      fields.push('parent_id = ?');
      values.push(data.parentId);
    }
    if (data.order !== undefined) {
      fields.push('block_order = ?');
      values.push(data.order);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(blockId);

    this.db
      .prepare(`UPDATE page_blocks SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
  }

  /**
   * Delete block
   */
  deleteBlock(blockId: string): void {
    this.db
      .prepare('DELETE FROM page_blocks WHERE id = ?')
      .run(blockId);
  }

  /**
   * Delete all blocks for a page
   */
  deleteBlocksByPage(pageId: number): void {
    this.db
      .prepare('DELETE FROM page_blocks WHERE page_id = ?')
      .run(pageId);
  }

  /**
   * Search pages by keyword
   */
  search(keyword: string, spaceId?: number): Page[] {
    let sql = `SELECT * FROM pages
               WHERE (title LIKE ? OR content LIKE ?)
               AND deleted_at IS NULL AND is_deleted = 0`;
    const params: any[] = [`%${keyword}%`, `%${keyword}%`];

    if (spaceId) {
      sql += ' AND space_id = ?';
      params.push(spaceId);
    }

    sql += ' ORDER BY updated_at DESC LIMIT 50';

    const results = this.db.prepare(sql).all(...params) as any[];
    return results.map((r) => this.mapToPage(r));
  }

  /**
   * Get deleted pages (trash)
   */
  getTrash(spaceId?: number): Page[] {
    let sql = 'SELECT * FROM pages WHERE is_deleted = 1';
    const params: any[] = [];

    if (spaceId) {
      sql += ' AND space_id = ?';
      params.push(spaceId);
    }

    sql += ' ORDER BY updated_at DESC';

    const results = this.db.prepare(sql).all(...params) as any[];
    return results.map((r) => this.mapToPage(r));
  }

  /**
   * Permanently delete page
   */
  permanentDelete(pageId: number): void {
    // Delete blocks first
    this.deleteBlocksByPage(pageId);
    // Remove from favorites
    this.removeFavorite(pageId);
    // Delete page
    this.db
      .prepare('DELETE FROM pages WHERE id = ?')
      .run(pageId);
  }

  /**
   * Empty trash for a space
   */
  emptyTrash(spaceId?: number): void {
    let sql = 'SELECT id FROM pages WHERE is_deleted = 1';
    const params: any[] = [];

    if (spaceId) {
      sql += ' AND space_id = ?';
      params.push(spaceId);
    }

    const pages = this.db.prepare(sql).all(...params) as { id: number }[];

    for (const page of pages) {
      this.permanentDelete(page.id);
    }
  }

  private mapToPage(row: any): Page {
    return {
      id: row.id,
      spaceId: row.space_id,
      title: row.title,
      content: row.content,
      parentId: row.parent_id,
      icon: row.icon,
      cover: row.cover,
      isDeleted: row.is_deleted === 1,
      creatorId: row.creator_id,
      localOnly: row.local_only === 1,
      syncStatus: row.sync_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapToBlock(row: any): any {
    return {
      id: row.id,
      pageId: row.page_id,
      type: row.type,
      content: row.content ? JSON.parse(row.content) : null,
      properties: row.properties ? JSON.parse(row.properties) : null,
      parentId: row.parent_id,
      order: row.block_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
