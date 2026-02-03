import { HttpClient } from './client';
import { FileInfo, FileDTO, TreeNode } from '../types';

export class FileApi {
  constructor(private http: HttpClient) {}

  /**
   * Create file or folder
   */
  async createFile(dto: FileDTO): Promise<void> {
    return this.http.post('/knowledge-file/file', dto);
  }

  /**
   * Get repo folder tree
   */
  async getRepoFolderTree(repoKey: string): Promise<TreeNode<number>[]> {
    return this.http.get<TreeNode<number>[]>(
      `/knowledge-file/repo/${repoKey}/folder/tree`
    );
  }

  /**
   * Get root folder
   */
  async getRootFolder(): Promise<TreeNode<number>[]> {
    return this.http.get<TreeNode<number>[]>('/knowledge-file/folder/root');
  }

  /**
   * Get folder children
   */
  async getFolderChildren(dto: {
    parentId?: number;
    repoKey?: string;
  }): Promise<FileInfo[]> {
    return this.http.get<FileInfo[]>('/knowledge-file/folder/children', dto);
  }

  /**
   * Get file by id
   */
  async getFileById(fileId: number): Promise<FileInfo> {
    return this.http.get<FileInfo>(`/knowledge-file/file/${fileId}`);
  }

  /**
   * Upload file
   */
  async uploadFile(
    file: File,
    params?: {
      parentId?: number;
      repoKey?: string;
    }
  ): Promise<FileInfo> {
    const formData = new FormData();
    formData.append('file', file);
    
    if (params?.parentId) {
      formData.append('parentId', params.parentId.toString());
    }
    if (params?.repoKey) {
      formData.append('repoKey', params.repoKey);
    }

    return this.http.post<FileInfo>('/knowledge-file/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    } as any);
  }

  /**
   * Download file
   */
  async downloadFile(fileId: number, savePath: string): Promise<void> {
    await this.http.downloadFile(
      `/knowledge-file/download/${fileId}`,
      savePath
    );
  }
}
