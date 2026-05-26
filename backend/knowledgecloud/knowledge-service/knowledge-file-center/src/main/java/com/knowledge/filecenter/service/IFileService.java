package com.knowledge.filecenter.service;

import java.util.List;

import com.knowledge.core.common.base.IBaseService;
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

}
