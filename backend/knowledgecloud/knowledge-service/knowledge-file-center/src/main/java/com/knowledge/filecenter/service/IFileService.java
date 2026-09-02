package com.knowledge.filecenter.service;

import java.util.List;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.common.base.IBaseService;
import com.knowledge.file.api.entity.dto.QueryFileDTO;
import com.knowledge.file.api.entity.enums.MediaType;
import com.knowledge.filecenter.entity.KnowledgeFile;

import cn.hutool.core.lang.tree.Tree;

public interface IFileService extends IBaseService<KnowledgeFile> {

    IFileRepositoryService getFileRepositoryService();

    KnowledgeFile createOrSaveFile(KnowledgeFile file);

    void moveFile(Long sourceId, Long targetId);

    List<Tree<Long>> folderTree(String repoKey, boolean includeFile);

    List<Tree<Long>> getRootFolderTree();

    List<KnowledgeFile> getChildren(Long fileId, boolean includeFolder, MediaType mediaType, String fileName);

    /** 分页查询子项(仅未删除) */
    IPage<KnowledgeFile> getChildrenPage(QueryFileDTO dto);

    /** 移入回收站(文件夹递归) */
    void moveToTrash(Long fileId);

    /** 从回收站还原(文件夹递归) */
    void restore(Long fileId);

    /** 回收站列表 */
    List<KnowledgeFile> listTrash();

    /** 收藏/取消收藏 */
    void toggleFavorite(Long fileId, boolean favorite);

    /** 收藏列表 */
    List<KnowledgeFile> listFavorites();

    /** 最近访问列表 */
    List<KnowledgeFile> listRecent(int limit);

    /** 记录最近访问时间并返回更新后的文件 */
    KnowledgeFile touchAccess(Long fileId);

    /** 复制文件/文件夹到目标目录(文件夹递归) */
    KnowledgeFile copyFile(Long fileId, Long targetParentId);

}
