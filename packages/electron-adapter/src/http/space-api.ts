import { HttpClient } from './client';
import {
  Space,
  SpaceDTO,
  Page,
  PageDTO,
  PageBlock,
  QuerySpaceDTO,
  QueryPageDTO,
  PageResult,
  TreeNode,
} from '../types';

export class SpaceApi {
  constructor(private http: HttpClient) { }

  /**
   * Create space
   */
  async createSpace(dto: SpaceDTO): Promise<void> {
    return this.http.post('/knowledge-wiki/space', dto);
  }

  /**
   * Get personal space
   */
  async getPersonalSpace(): Promise<Space> {
    return this.http.get<Space>('/knowledge-wiki/space/personal');
  }

  /**
   * Get space list
   */
  async getSpaceList(dto: QuerySpaceDTO): Promise<PageResult<Space>> {
    return this.http.get<PageResult<Space>>('/knowledge-wiki/space/list', dto);
  }

  /**
   * Get space detail
   */
  async getSpaceDetail(id: number): Promise<Space> {
    return this.http.get<Space>(`/knowledge-wiki/space/${id}/detail`);
  }

  /**
   * Add space to favorites
   */
  async addFavorite(id: number): Promise<void> {
    return this.http.post(`/knowledge-wiki/space/${id}/favorite`);
  }

  /**
   * Get page tree
   */
  async getPageTree(
    spaceId: number,
    searchValue?: string
  ): Promise<TreeNode<number>[]> {
    return this.http.get<TreeNode<number>[]>(
      `/knowledge-wiki/space/${spaceId}/page/tree`,
      { searchValue }
    );
  }

  /**
   * Get space members
   */
  async getMembers(spaceId: number): Promise<any[]> {
    return this.http.get(`/knowledge-wiki/space/${spaceId}/members`);
  }

  /**
   * Get templates
   */
  async getTemplates(dto: QuerySpaceDTO): Promise<PageResult<Space>> {
    return this.http.get<PageResult<Space>>(
      '/knowledge-wiki/space/templates',
      dto
    );
  }
}

export class PageApi {
  constructor(private http: HttpClient) { }

  /**
   * Create page
   */
  async createPage(dto: PageDTO): Promise<Page> {
    return this.http.post<Page>('/knowledge-wiki/space/page', dto);
  }

  /**
   * Get page content
   */
  async getPageContent(id: number): Promise<Page> {
    return this.http.get<Page>(`/knowledge-wiki/space/page/${id}/content`);
  }

  /**
   * Get page list
   */
  async getPageList(dto: QueryPageDTO): Promise<PageResult<Page>> {
    return this.http.get<PageResult<Page>>('/knowledge-wiki/space/page/list', dto);
  }

  /**
   * Move page to trash
   */
  async moveToTrash(id: number): Promise<void> {
    return this.http.delete(`/knowledge-wiki/space/page/${id}/trash`);
  }

  /**
   * Restore page from trash
   */
  async restorePage(id: number): Promise<void> {
    return this.http.put(`/knowledge-wiki/space/page/${id}/restore`);
  }

  /**
   * Add page to favorites
   */
  async addFavorite(id: number): Promise<void> {
    return this.http.post(`/knowledge-wiki/space/page/${id}/favorite`);
  }

  /**
   * Remove page from favorites
   */
  async removeFavorite(id: number): Promise<void> {
    return this.http.delete(`/knowledge-wiki/space/page/${id}/favorite`);
  }

  /**
   * Save page as template
   */
  async saveAsTemplate(id: number): Promise<void> {
    return this.http.post(`/knowledge-wiki/space/page/${id}/template`);
  }

  /**
   * Get favorite pages
   */
  async getFavorites(dto?: any): Promise<Page[]> {
    return this.http.get<Page[]>('/knowledge-wiki/space/page/favorites', dto);
  }

  /**
   * Get recent pages
   */
  async getRecentPages(dto: QueryPageDTO): Promise<PageResult<Page>> {
    return this.http.get<PageResult<Page>>(
      '/knowledge-wiki/space/page/recent',
      dto
    );
  }

  /**
   * Get page blocks
   */
  async getPageBlocks(dto: any): Promise<PageResult<PageBlock>> {
    return this.http.get<PageResult<PageBlock>>(
      '/knowledge-wiki/space/page/blocks',
      dto
    );
  }

  /**
   * Get block info
   */
  async getBlockInfo(id: string): Promise<PageBlock> {
    return this.http.get<PageBlock>('/knowledge-wiki/space/page/block', { id });
  }

  /**
   * Get invited pages
   */
  async getInvitedPages(): Promise<Page[]> {
    return this.http.get<Page[]>('/knowledge-wiki/space/page/invited');
  }

  /**
   * Get page collaborators
   */
  async getCollaborators(pageId: number): Promise<any[]> {
    return this.http.get(
      `/knowledge-wiki/space/page/${pageId}/collaborators`
    );
  }

  /**
   * Update collaborator permission
   */
  async updateCollaboratorPermission(
    pageId: number,
    userId: number,
    permission: string
  ): Promise<void> {
    return this.http.put(
      `/knowledge-wiki/space/page/${pageId}/collaborator/${userId}/permission`,
      { permission }
    );
  }

  /**
   * Remove collaborator
   */
  async removeCollaborator(pageId: number, userId: number): Promise<void> {
    return this.http.delete(
      `/knowledge-wiki/space/page/${pageId}/collaborator/${userId}`
    );
  }

  /**
   * Generate share link
   */
  async generateShareLink(
    pageId: number,
    dto: { expireTime?: number; password?: string }
  ): Promise<any> {
    return this.http.post(
      `/knowledge-wiki/space/page/${pageId}/share-link`,
      dto
    );
  }

  /**
   * Move page to another parent/space
   */
  async movePage(
    pageId: number,
    dto: { targetParentId: number | null; targetSpaceId: number }
  ): Promise<void> {
    return this.http.put(
      `/knowledge-wiki/space/page/${pageId}/move`,
      dto
    );
  }
}
