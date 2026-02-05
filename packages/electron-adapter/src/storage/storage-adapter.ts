import EventEmitter from 'eventemitter3';
import { SpaceRepository, PageRepository } from '../database/space-repository';
import { SpaceApi, PageApi } from '../http/space-api';
import { AuthManager } from '../auth/auth-manager';
import {
  Space,
  Page,
  SpaceDTO,
  PageDTO,
  StorageMode,
  SyncStatus,
  QuerySpaceDTO,
  QueryPageDTO,
  PageResult,
  TreeNode,
} from '../types';

export interface StorageAdapterEvents {
  'data:changed': (type: 'space' | 'page', id: number) => void;
  'sync:required': (type: 'space' | 'page', ids: number[]) => void;
}

export class StorageAdapter extends EventEmitter<StorageAdapterEvents> {
  private mode: StorageMode = StorageMode.LOCAL;
  
  constructor(
    private spaceRepository: SpaceRepository,
    private pageRepository: PageRepository,
    private spaceApi: SpaceApi,
    private pageApi: PageApi,
    private authManager: AuthManager
  ) {
    super();
    this.updateStorageMode();

    // Listen to auth changes
    authManager.on('auth:login', () => this.updateStorageMode());
    authManager.on('auth:logout', () => this.updateStorageMode());
    authManager.on('membership:changed', () => this.updateStorageMode());
  }

  /**
   * Get current storage mode
   */
  getMode(): StorageMode {
    return this.mode;
  }

  // ==================== Space Operations ====================

  /**
   * Create space
   */
  async createSpace(dto: SpaceDTO): Promise<Space> {
    const userId = this.authManager.getAuthInfo()?.userId || 0;
    
    if (this.mode === StorageMode.LOCAL) {
      // Local only
      const id = this.spaceRepository.create({
        ...dto,
        creatorId: userId,
        localOnly: true,
        syncStatus: SyncStatus.PENDING,
      } as any);

      const space = this.spaceRepository.getById(id)!;
      this.emit('data:changed', 'space', id);
      return space;
    }

    // Cloud or Hybrid - create on server first
    await this.spaceApi.createSpace(dto);
    
    // Fetch from server to get full data
    const spaces = await this.spaceApi.getSpaceList({ size: 1 });
    const space = spaces.records[0];
    
    // Save to local if hybrid mode
    if (this.mode === StorageMode.HYBRID) {
      this.spaceRepository.create({
        ...space,
        localOnly: false,
        syncStatus: SyncStatus.SYNCED,
      });
    }

    this.emit('data:changed', 'space', space.id);
    return space;
  }

  /**
   * Get space by ID
   */
  async getSpace(id: number): Promise<Space | null> {
    // Try local first
    const localSpace = this.spaceRepository.getById(id);
    
    if (localSpace && (this.mode === StorageMode.LOCAL || localSpace.localOnly)) {
      return localSpace;
    }

    // Fetch from cloud
    if (this.mode !== StorageMode.LOCAL && this.authManager.isLoggedIn()) {
      try {
        const space = await this.spaceApi.getSpaceDetail(id);
        
        // Cache if hybrid mode
        if (this.mode === StorageMode.HYBRID) {
          if (localSpace) {
            this.spaceRepository.update(id, {
              ...space,
              syncStatus: SyncStatus.SYNCED,
            });
          } else {
            this.spaceRepository.create({
              ...space,
              localOnly: false,
              syncStatus: SyncStatus.SYNCED,
            });
          }
        }
        
        return space;
      } catch (error) {
        console.error('Failed to fetch space from cloud:', error);
        return localSpace;
      }
    }

    return localSpace;
  }

  /**
   * Get all spaces
   */
  async getAllSpaces(): Promise<Space[]> {
    if (this.mode === StorageMode.LOCAL) {
      return this.spaceRepository.getAll();
    }

    // Fetch from cloud
    if (this.authManager.isLoggedIn()) {
      try {
        const result = await this.spaceApi.getSpaceList({ size: 100 });
        
        // Merge with local spaces if hybrid mode
        if (this.mode === StorageMode.HYBRID) {
          const localSpaces = this.spaceRepository.getAll();
          
          // Save cloud spaces to local
          for (const space of result.records) {
            const existing = localSpaces.find((s) => s.id === space.id);
            if (existing) {
              this.spaceRepository.update(space.id, {
                ...space,
                syncStatus: SyncStatus.SYNCED,
              });
            } else {
              this.spaceRepository.create({
                ...space,
                localOnly: false,
                syncStatus: SyncStatus.SYNCED,
              });
            }
          }
          
          // Return all (local + cloud)
          return this.spaceRepository.getAll();
        }
        
        return result.records;
      } catch (error) {
        console.error('Failed to fetch spaces from cloud:', error);
        // Fallback to local
        return this.spaceRepository.getAll();
      }
    }

    return this.spaceRepository.getAll();
  }

  /**
   * Update space
   */
  async updateSpace(id: number, data: Partial<Space>): Promise<void> {
    const space = await this.getSpace(id);
    if (!space) {
      throw new Error('Space not found');
    }

    // Update local
    this.spaceRepository.update(id, {
      ...data,
      syncStatus: space.localOnly ? SyncStatus.PENDING : data.syncStatus,
    });

    // Update cloud if not local-only
    if (this.mode !== StorageMode.LOCAL && !space.localOnly && this.authManager.isLoggedIn()) {
      try {
        // TODO: Call cloud API to update space
        // await this.spaceApi.updateSpace(id, data);
        
        this.spaceRepository.update(id, { syncStatus: SyncStatus.SYNCED });
      } catch (error) {
        console.error('Failed to update space on cloud:', error);
        this.spaceRepository.update(id, { syncStatus: SyncStatus.PENDING });
        this.emit('sync:required', 'space', [id]);
      }
    }

    this.emit('data:changed', 'space', id);
  }

  /**
   * Delete space
   */
  async deleteSpace(id: number): Promise<void> {
    const space = await this.getSpace(id);
    if (!space) return;

    // Delete from cloud first
    if (this.mode !== StorageMode.LOCAL && !space.localOnly && this.authManager.isLoggedIn()) {
      try {
        // TODO: Call cloud API to delete space
        // await this.spaceApi.deleteSpace(id);
      } catch (error) {
        console.error('Failed to delete space from cloud:', error);
      }
    }

    // Delete local
    this.spaceRepository.delete(id);
    this.emit('data:changed', 'space', id);
  }

  // ==================== Page Operations ====================

  /**
   * Create page
   */
  async createPage(dto: PageDTO): Promise<Page> {
    const userId = this.authManager.getAuthInfo()?.userId || 0;
    
    if (this.mode === StorageMode.LOCAL) {
      // Local only
      const id = this.pageRepository.create({
        ...dto,
        creatorId: userId,
        isDeleted: false,
        localOnly: true,
        syncStatus: SyncStatus.PENDING,
      } as any);

      const page = this.pageRepository.getById(id)!;
      this.emit('data:changed', 'page', id);
      return page;
    }

    // Cloud or Hybrid - create on server first
    const page = await this.pageApi.createPage(dto);
    
    // Save to local if hybrid mode
    if (this.mode === StorageMode.HYBRID) {
      this.pageRepository.create({
        ...page,
        localOnly: false,
        syncStatus: SyncStatus.SYNCED,
      });
    }

    this.emit('data:changed', 'page', page.id);
    return page;
  }

  /**
   * Get page by ID
   */
  async getPage(id: number): Promise<Page | null> {
    // Try local first
    const localPage = this.pageRepository.getById(id);
    
    if (localPage) {
      this.pageRepository.recordAccess(id);
      
      if (this.mode === StorageMode.LOCAL || localPage.localOnly) {
        return localPage;
      }
    }

    // Fetch from cloud
    if (this.mode !== StorageMode.LOCAL && this.authManager.isLoggedIn()) {
      try {
        const page = await this.pageApi.getPageContent(id);
        
        // Cache if hybrid mode
        if (this.mode === StorageMode.HYBRID) {
          if (localPage) {
            this.pageRepository.update(id, {
              ...page,
              syncStatus: SyncStatus.SYNCED,
            });
          } else {
            this.pageRepository.create({
              ...page,
              localOnly: false,
              syncStatus: SyncStatus.SYNCED,
            });
          }
        }
        
        this.pageRepository.recordAccess(id);
        return page;
      } catch (error) {
        console.error('Failed to fetch page from cloud:', error);
        return localPage;
      }
    }

    return localPage;
  }

  /**
   * Get pages by space ID
   */
  async getPagesBySpace(spaceId: number): Promise<Page[]> {
    if (this.mode === StorageMode.LOCAL) {
      return this.pageRepository.getBySpaceId(spaceId);
    }

    // Fetch from cloud
    if (this.authManager.isLoggedIn()) {
      try {
        const result = await this.pageApi.getPageList({ spaceId, size: 1000 });
        
        // Merge with local pages if hybrid mode
        if (this.mode === StorageMode.HYBRID) {
          for (const page of result.records) {
            const existing = this.pageRepository.getById(page.id);
            if (existing) {
              this.pageRepository.update(page.id, {
                ...page,
                syncStatus: SyncStatus.SYNCED,
              });
            } else {
              this.pageRepository.create({
                ...page,
                localOnly: false,
                syncStatus: SyncStatus.SYNCED,
              });
            }
          }
        }
        
        return this.mode === StorageMode.HYBRID
          ? this.pageRepository.getBySpaceId(spaceId)
          : result.records;
      } catch (error) {
        console.error('Failed to fetch pages from cloud:', error);
        return this.pageRepository.getBySpaceId(spaceId);
      }
    }

    return this.pageRepository.getBySpaceId(spaceId);
  }

  /**
   * Get page tree
   */
  async getPageTree(spaceId: number): Promise<TreeNode<number>[]> {
    if (this.mode === StorageMode.LOCAL || !this.authManager.isLoggedIn()) {
      // Build tree from local pages
      const pages = this.pageRepository.getTree(spaceId);
      return this.buildTree(pages);
    }

    // Fetch from cloud
    try {
      return await this.spaceApi.getPageTree(spaceId);
    } catch (error) {
      console.error('Failed to fetch page tree from cloud:', error);
      // Fallback to local
      const pages = this.pageRepository.getTree(spaceId);
      return this.buildTree(pages);
    }
  }

  /**
   * Get recent pages
   */
  async getRecentPages(limit: number = 10): Promise<Page[]> {
    return this.pageRepository.getRecent(limit);
  }

  /**
   * Update page
   */
  async updatePage(id: number, data: Partial<Page>): Promise<void> {
    const page = await this.getPage(id);
    if (!page) {
      throw new Error('Page not found');
    }

    // Update local
    this.pageRepository.update(id, {
      ...data,
      syncStatus: page.localOnly ? SyncStatus.PENDING : data.syncStatus,
    });

    // Update cloud if not local-only
    if (this.mode !== StorageMode.LOCAL && !page.localOnly && this.authManager.isLoggedIn()) {
      try {
        // TODO: Call cloud API to update page
        // await this.pageApi.updatePage(id, data);
        
        this.pageRepository.update(id, { syncStatus: SyncStatus.SYNCED });
      } catch (error) {
        console.error('Failed to update page on cloud:', error);
        this.pageRepository.update(id, { syncStatus: SyncStatus.PENDING });
        this.emit('sync:required', 'page', [id]);
      }
    }

    this.emit('data:changed', 'page', id);
  }

  /**
   * Delete page (move to trash)
   */
  async deletePage(id: number): Promise<void> {
    const page = await this.getPage(id);
    if (!page) return;

    // Delete from cloud first
    if (this.mode !== StorageMode.LOCAL && !page.localOnly && this.authManager.isLoggedIn()) {
      try {
        await this.pageApi.moveToTrash(id);
      } catch (error) {
        console.error('Failed to delete page from cloud:', error);
      }
    }

    // Delete local
    this.pageRepository.delete(id);
    this.emit('data:changed', 'page', id);
  }

  /**
   * Restore page from trash
   */
  async restorePage(id: number): Promise<void> {
    const page = await this.getPage(id);
    if (!page) return;

    // Restore on cloud first
    if (this.mode !== StorageMode.LOCAL && !page.localOnly && this.authManager.isLoggedIn()) {
      try {
        await this.pageApi.restorePage(id);
      } catch (error) {
        console.error('Failed to restore page on cloud:', error);
      }
    }

    // Restore local
    this.pageRepository.restore(id);
    this.emit('data:changed', 'page', id);
  }

  /**
   * Private: Update storage mode based on auth state
   */
  private updateStorageMode(): void {
    if (!this.authManager.isLoggedIn()) {
      this.mode = StorageMode.LOCAL;
    } else if (this.authManager.isMember()) {
      this.mode = StorageMode.HYBRID;
    } else {
      this.mode = StorageMode.CLOUD;
    }

    console.log(`Storage mode changed to: ${this.mode}`);
  }

  // ==================== Favorites Operations ====================

  /**
   * Add space to favorites
   */
  async addSpaceFavorite(spaceId: number): Promise<void> {
    this.spaceRepository.addFavorite(spaceId);
    this.emit('data:changed', 'space', spaceId);
  }

  /**
   * Remove space from favorites
   */
  async removeSpaceFavorite(spaceId: number): Promise<void> {
    this.spaceRepository.removeFavorite(spaceId);
    this.emit('data:changed', 'space', spaceId);
  }

  /**
   * Get favorited spaces
   */
  async getFavoriteSpaces(): Promise<Space[]> {
    return this.spaceRepository.getFavorites();
  }

  /**
   * Add page to favorites
   */
  async addPageFavorite(pageId: number): Promise<void> {
    this.pageRepository.addFavorite(pageId);
    this.emit('data:changed', 'page', pageId);
  }

  /**
   * Remove page from favorites
   */
  async removePageFavorite(pageId: number): Promise<void> {
    this.pageRepository.removeFavorite(pageId);
    this.emit('data:changed', 'page', pageId);
  }

  /**
   * Get favorited pages
   */
  async getFavoritePages(): Promise<Page[]> {
    return this.pageRepository.getFavorites();
  }

  // ==================== Template Operations ====================

  /**
   * Get space templates
   */
  async getSpaceTemplates(): Promise<Space[]> {
    return this.spaceRepository.getTemplates();
  }

  /**
   * Get page templates
   */
  async getPageTemplates(): Promise<Page[]> {
    return this.pageRepository.getTemplates();
  }

  /**
   * Save page as template
   */
  async savePageAsTemplate(pageId: number): Promise<void> {
    this.pageRepository.saveAsTemplate(pageId);
    this.emit('data:changed', 'page', pageId);
  }

  // ==================== Block Operations ====================

  /**
   * Get page blocks
   */
  async getPageBlocks(pageId: number): Promise<any[]> {
    return this.pageRepository.getBlocks(pageId);
  }

  /**
   * Get block by ID
   */
  async getBlockById(blockId: string): Promise<any | null> {
    return this.pageRepository.getBlockById(blockId);
  }

  /**
   * Create block
   */
  async createBlock(block: {
    id: string;
    pageId: number;
    type: string;
    content?: any;
    properties?: Record<string, any>;
    parentId?: string;
    order?: number;
  }): Promise<void> {
    this.pageRepository.createBlock(block);
    this.emit('data:changed', 'page', block.pageId);
  }

  /**
   * Update block
   */
  async updateBlock(blockId: string, data: any): Promise<void> {
    this.pageRepository.updateBlock(blockId, data);
  }

  /**
   * Delete block
   */
  async deleteBlock(blockId: string): Promise<void> {
    this.pageRepository.deleteBlock(blockId);
  }

  // ==================== Search Operations ====================

  /**
   * Search pages
   */
  async searchPages(keyword: string, spaceId?: number): Promise<Page[]> {
    return this.pageRepository.search(keyword, spaceId);
  }

  // ==================== Trash Operations ====================

  /**
   * Get trash pages
   */
  async getTrashPages(spaceId?: number): Promise<Page[]> {
    return this.pageRepository.getTrash(spaceId);
  }

  /**
   * Permanently delete page
   */
  async permanentDeletePage(pageId: number): Promise<void> {
    this.pageRepository.permanentDelete(pageId);
    this.emit('data:changed', 'page', pageId);
  }

  /**
   * Empty trash
   */
  async emptyTrash(spaceId?: number): Promise<void> {
    this.pageRepository.emptyTrash(spaceId);
  }

  /**
   * Private: Build tree from flat page list
   */
  private buildTree(pages: Page[]): TreeNode<number>[] {
    const map = new Map<number, TreeNode<number>>();
    const roots: TreeNode<number>[] = [];

    // Create nodes
    for (const page of pages) {
      map.set(page.id, {
        id: page.id,
        name: page.title,
        parentId: page.parentId || undefined,
        children: [],
      });
    }

    // Build tree
    for (const page of pages) {
      const node = map.get(page.id)!;
      if (page.parentId) {
        const parent = map.get(page.parentId);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}
