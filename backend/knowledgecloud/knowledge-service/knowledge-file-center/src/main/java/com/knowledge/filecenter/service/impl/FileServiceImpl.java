package com.knowledge.filecenter.service.impl;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.knowledge.core.common.base.BaseService;
import com.knowledge.file.api.entity.enums.FileType;
import com.knowledge.file.api.entity.enums.MediaType;
import com.knowledge.filecenter.converter.KnowledgeFileConverter;
import com.knowledge.filecenter.entity.KnowledgeFile;
import com.knowledge.filecenter.entity.KnowledgeFileRepository;
import com.knowledge.filecenter.mapper.FileMapper;
import com.knowledge.filecenter.service.IFileRepositoryService;
import com.knowledge.filecenter.service.IFileService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.io.FileUtil;
import cn.hutool.core.lang.UUID;
import cn.hutool.core.lang.tree.Tree;
import cn.hutool.core.lang.tree.TreeNodeConfig;
import cn.hutool.core.lang.tree.TreeUtil;
import cn.hutool.core.util.StrUtil;
import lombok.Getter;

@Service
public class FileServiceImpl extends BaseService<FileMapper, KnowledgeFile> implements IFileService {

    public static final Long TOP_FOLDER_PARENT_ID = 0L;

    @Getter
    @Autowired
    private IFileRepositoryService fileRepositoryService;

    @Override
    public KnowledgeFile createOrSaveFile(KnowledgeFile file) {

        if (file.getParentId() != null && !file.getParentId().equals(TOP_FOLDER_PARENT_ID)) {
            KnowledgeFile parent = this.getById(file.getParentId());
            file.setAncestors(parent.getAncestors() + "," + parent.getId());
        } else {
            file.setParentId(TOP_FOLDER_PARENT_ID);
            file.setAncestors(TOP_FOLDER_PARENT_ID + "");
        }
        if (file.getType() == FileType.FILE) {
            file.setSuffix(FileUtil.getSuffix(file.getName()));
        }

        if (file.getId() != null) {
            KnowledgeFile db = this.getById(file.getId());
            KnowledgeFileConverter.INSTANCE.update(file, db);
            this.updateById(db);
        } else {
            file.setFileKey(UUID.fastUUID().toString());
            this.save(file);
        }
        return file;
    }

    @Override
    public void moveFile(Long sourceId, Long targetId) {
        KnowledgeFile source = this.getById(sourceId);
        if (source == null) {
            throw new IllegalArgumentException("Source file not found");
        }

        KnowledgeFile target = this.getById(targetId);
        if (target == null || target.getType() != FileType.FOLDER) {
            throw new IllegalArgumentException("Target must be a valid folder");
        }

        // Update parent and ancestors
        source.setParentId(targetId);
        source.setAncestors(target.getAncestors() + "," + target.getId());

        this.updateById(source);

        // If moving a folder, update all descendants
        if (source.getType() == FileType.FOLDER) {
            updateDescendantsAncestors(source);
        }
    }

    /**
     * Update ancestors for all descendants of a moved folder
     */
    private void updateDescendantsAncestors(KnowledgeFile folder) {
        List<KnowledgeFile> children = this.lambdaQuery()
                .eq(KnowledgeFile::getParentId, folder.getId())
                .list();

        for (KnowledgeFile child : children) {
            child.setAncestors(folder.getAncestors() + "," + folder.getId());
            this.updateById(child);

            if (child.getType() == FileType.FOLDER) {
                updateDescendantsAncestors(child);
            }
        }
    }

    @Override
    public List<Tree<Long>> folderTree(String repoKey, boolean includeFile) {
        List<KnowledgeFile> files = this.lambdaQuery()
                .eq(KnowledgeFile::getRepositoryKey, repoKey)
                .eq(!includeFile, KnowledgeFile::getType, FileType.FOLDER)
                .list();
        if (CollUtil.isEmpty(files)) {
            return CollUtil.newArrayList();
        }

        TreeNodeConfig config = new TreeNodeConfig();
        config.setIdKey("id")
                .setParentIdKey("parentId")
                .setNameKey("name");

        return TreeUtil.build(files, 0L, config, (object, node) -> {
            node.setId(object.getId())
                    .setName(object.getName())
                    .setParentId(object.getParentId());
            node.putExtra("ancestors", object.getAncestors());
            node.putExtra("fileKey", object.getFileKey());
            node.putExtra("type", object.getType());
        });
    }

    @Override
    public List<KnowledgeFile> getChildren(Long fileId, boolean includeFolder, MediaType mediaType, String fileName) {
        return this.lambdaQuery()
                .eq(KnowledgeFile::getParentId, fileId)
                .eq(!includeFolder, KnowledgeFile::getType, FileType.FILE)
                .like(StrUtil.isNotBlank(fileName), KnowledgeFile::getName, fileName)
                .list();
    }

    @Override
    public List<Tree<Long>> getRootFolderTree() {
        KnowledgeFileRepository root = fileRepositoryService.getDefaultFileRepo();
        return this.folderTree(root.getRepoKey(), false);
    }

}
