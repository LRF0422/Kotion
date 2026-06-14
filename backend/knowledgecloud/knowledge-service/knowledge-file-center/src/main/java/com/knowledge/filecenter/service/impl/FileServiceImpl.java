package com.knowledge.filecenter.service.impl;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.common.base.BaseService;
import com.knowledge.file.api.entity.dto.QueryFileDTO;
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
    private static final Integer NOT_TRASHED = 0;
    private static final Integer TRASHED = 1;

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
            file.setMediaType(resolveMediaType(file.getSuffix()));
        }

        if (file.getId() != null) {
            KnowledgeFile db = this.getById(file.getId());
            KnowledgeFileConverter.INSTANCE.update(file, db);
            this.updateById(db);
        } else {
            file.setFileKey(UUID.fastUUID().toString());
            if (file.getTrashed() == null) {
                file.setTrashed(NOT_TRASHED);
            }
            if (file.getFavorite() == null) {
                file.setFavorite(NOT_TRASHED);
            }
            this.save(file);
        }
        return file;
    }

    /**
     * 根据文件后缀推导 MediaType
     */
    public static MediaType resolveMediaType(String suffix) {
        if (StrUtil.isBlank(suffix)) {
            return MediaType.OTHER;
        }
        switch (suffix.toLowerCase()) {
            case "jpg":
            case "jpeg":
            case "png":
            case "gif":
            case "bmp":
            case "webp":
            case "svg":
                return MediaType.IMAGE;
            case "doc":
                return MediaType.DOC;
            case "docx":
                return MediaType.DOCX;
            case "xls":
                return MediaType.XLS;
            case "xlsx":
                return MediaType.XLSX;
            case "pdf":
                return MediaType.PDF;
            default:
                return MediaType.OTHER;
        }
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
                .eq(KnowledgeFile::getTrashed, NOT_TRASHED)
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
                .eq(KnowledgeFile::getTrashed, NOT_TRASHED)
                .eq(!includeFolder, KnowledgeFile::getType, FileType.FILE)
                .eq(mediaType != null, KnowledgeFile::getMediaType, mediaType)
                .like(StrUtil.isNotBlank(fileName), KnowledgeFile::getName, fileName)
                .list();
    }

    @Override
    public IPage<KnowledgeFile> getChildrenPage(QueryFileDTO dto) {
        return this.lambdaQuery()
                .eq(KnowledgeFile::getParentId, dto.getFolderId())
                .eq(KnowledgeFile::getTrashed, NOT_TRASHED)
                .eq(dto.getMediaType() != null, KnowledgeFile::getMediaType, dto.getMediaType())
                .like(StrUtil.isNotBlank(dto.getFileName()), KnowledgeFile::getName, dto.getFileName())
                .orderByDesc(KnowledgeFile::getType)
                .page(dto.page());
    }

    @Override
    public List<Tree<Long>> getRootFolderTree() {
        KnowledgeFileRepository root = fileRepositoryService.getDefaultFileRepo();
        return this.folderTree(root.getRepoKey(), false);
    }

    @Override
    public void moveToTrash(Long fileId) {
        KnowledgeFile file = this.getById(fileId);
        if (file == null) {
            throw new IllegalArgumentException("File not found");
        }
        file.setTrashed(TRASHED);
        file.setTrashedTime(LocalDateTime.now());
        this.updateById(file);

        // 文件夹递归:子项一并进回收站
        if (file.getType() == FileType.FOLDER) {
            List<KnowledgeFile> children = this.lambdaQuery()
                    .eq(KnowledgeFile::getParentId, fileId)
                    .eq(KnowledgeFile::getTrashed, NOT_TRASHED)
                    .list();
            for (KnowledgeFile child : children) {
                moveToTrash(child.getId());
            }
        }
    }

    @Override
    public void restore(Long fileId) {
        KnowledgeFile file = this.getById(fileId);
        if (file == null) {
            throw new IllegalArgumentException("File not found");
        }
        file.setTrashed(NOT_TRASHED);
        file.setTrashedTime(null);
        this.updateById(file);

        if (file.getType() == FileType.FOLDER) {
            List<KnowledgeFile> children = this.lambdaQuery()
                    .eq(KnowledgeFile::getParentId, fileId)
                    .eq(KnowledgeFile::getTrashed, TRASHED)
                    .list();
            for (KnowledgeFile child : children) {
                restore(child.getId());
            }
        }
    }

    @Override
    public List<KnowledgeFile> listTrash() {
        return this.lambdaQuery()
                .eq(KnowledgeFile::getTrashed, TRASHED)
                .orderByDesc(KnowledgeFile::getTrashedTime)
                .list();
    }

    @Override
    public void toggleFavorite(Long fileId, boolean favorite) {
        KnowledgeFile file = this.getById(fileId);
        if (file == null) {
            throw new IllegalArgumentException("File not found");
        }
        file.setFavorite(favorite ? TRASHED : NOT_TRASHED);
        this.updateById(file);
    }

    @Override
    public List<KnowledgeFile> listFavorites() {
        return this.lambdaQuery()
                .eq(KnowledgeFile::getFavorite, TRASHED)
                .eq(KnowledgeFile::getTrashed, NOT_TRASHED)
                .orderByDesc(KnowledgeFile::getUpdateTime)
                .list();
    }

    @Override
    public List<KnowledgeFile> listRecent(int limit) {
        return this.lambdaQuery()
                .eq(KnowledgeFile::getTrashed, NOT_TRASHED)
                .eq(KnowledgeFile::getType, FileType.FILE)
                .isNotNull(KnowledgeFile::getLastAccessedTime)
                .orderByDesc(KnowledgeFile::getLastAccessedTime)
                .last("limit " + Math.max(1, limit))
                .list();
    }

    @Override
    public void touchAccess(Long fileId) {
        KnowledgeFile file = this.getById(fileId);
        if (file == null) {
            return;
        }
        file.setLastAccessedTime(LocalDateTime.now());
        this.updateById(file);
    }

    @Override
    public KnowledgeFile copyFile(Long fileId, Long targetParentId) {
        KnowledgeFile source = this.getById(fileId);
        if (source == null) {
            throw new IllegalArgumentException("Source file not found");
        }

        KnowledgeFile copy = new KnowledgeFile();
        copy.setType(source.getType());
        copy.setMediaType(source.getMediaType());
        copy.setName(source.getName());
        copy.setPath(source.getPath());
        copy.setSuffix(source.getSuffix());
        // 文件复用同一 OSS 对象(fileKey 指向同一存储);createOrSaveFile 会为新记录另生成 fileKey,
        // 这里保留指向同一 OSS link 的 path 即可定位资源。
        copy.setFileKey(source.getFileKey());
        copy.setRepositoryKey(source.getRepositoryKey());
        copy.setParentId(targetParentId != null ? targetParentId : TOP_FOLDER_PARENT_ID);
        copy.setSize(source.getSize());
        copy.setTrashed(NOT_TRASHED);
        copy.setFavorite(NOT_TRASHED);
        this.save(setAncestors(copy));

        // 文件夹递归复制子树
        if (source.getType() == FileType.FOLDER) {
            List<KnowledgeFile> children = this.lambdaQuery()
                    .eq(KnowledgeFile::getParentId, fileId)
                    .eq(KnowledgeFile::getTrashed, NOT_TRASHED)
                    .list();
            for (KnowledgeFile child : children) {
                copyFile(child.getId(), copy.getId());
            }
        }
        return copy;
    }

    /**
     * 根据 parentId 计算并设置 ancestors
     */
    private KnowledgeFile setAncestors(KnowledgeFile file) {
        if (file.getParentId() != null && !file.getParentId().equals(TOP_FOLDER_PARENT_ID)) {
            KnowledgeFile parent = this.getById(file.getParentId());
            file.setAncestors(parent.getAncestors() + "," + parent.getId());
        } else {
            file.setParentId(TOP_FOLDER_PARENT_ID);
            file.setAncestors(TOP_FOLDER_PARENT_ID + "");
        }
        return file;
    }

}
