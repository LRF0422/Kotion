package com.knowledge.filecenter.skill;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;

import com.knowledge.core.agent.annotation.AgentSkill;
import com.knowledge.core.agent.annotation.SkillTierValue;
import com.knowledge.core.agent.annotation.SkillTool;
import com.knowledge.core.agent.annotation.ToolParam;
import com.knowledge.file.api.entity.dto.KnowledgeFileDTO;
import com.knowledge.file.api.entity.dto.MoveFileDTO;
import com.knowledge.file.api.entity.enums.FileType;
import com.knowledge.filecenter.application.FileApplication;
import com.knowledge.filecenter.entity.KnowledgeFile;
import com.knowledge.filecenter.entity.KnowledgeFileRepository;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;
import com.knowledge.filecenter.service.IFileRepositoryService;
import com.knowledge.filecenter.service.IFileService;

import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * File Operation skill using annotation-based registration.
 * <p>
 * This skill provides file and folder operations including:
 * <ul>
 * <li><b>createFolder</b> - Create a new folder in the file center</li>
 * <li><b>renameFile</b> - Rename a file or folder</li>
 * <li><b>moveFile</b> - Move a file or folder to another folder</li>
 * <li><b>listFolder</b> - List files and sub-folders inside a folder</li>
 * <li><b>getFileInfo</b> - Get details of a file or folder</li>
 * <li><b>deleteFile</b> - Delete a file or folder</li>
 * </ul>
 * <p>
 * For downloading files from URLs, use the <b>download_file</b> tool provided
 * by
 * WebDownloadSkill, which includes advanced anti-crawling protections.
 */
@Slf4j
@AgentSkill(id = "file-operation", name = "File Operation", description = "Perform file and folder operations in the file center: create folders, rename files/folders, "
        +
        "move files between folders, list folder contents, "
        +
        "get file details, and delete files/folders. For downloading files from URLs, use the "
        +
        "download_file tool from WebDownloadSkill.", version = "1.0.0", author = "KnowledgeCloud", tier = SkillTierValue.DOMAIN, categories = {
                "file-management", "document-operations" })
public class FileOperationSkill {

    @Autowired
    private FileApplication fileApplication;

    @Autowired
    private IFileService fileService;

    /**
     * Create a new folder in the file center.
     *
     * @param name          the folder name
     * @param parentId      the parent folder ID (null or 0 for root)
     * @param repositoryKey the repository key (null for default)
     * @return result message with folder details
     */
    @SkillTool(name = "create_folder", description = "Create a new folder in the file center. "
            +
            "Provide the folder name and optionally the parent folder ID and repository key. "
            +
            "Returns the created folder's ID, name, and parent info.")
    public String createFolder(
            @ToolParam(name = "name", description = "The name of the new folder", type = "string", required = true) String name,
            @ToolParam(name = "parentId", description = "The parent folder ID. Use 0 or null for root level.", type = "number", required = false) Long parentId,
            @ToolParam(name = "repositoryKey", description = "The repository key. Leave empty to use the default repository.", type = "string", required = false) String repositoryKey) {
        if (StrUtil.isBlank(name)) {
            return "Error: Missing required parameter: name";
        }

        log.info("Creating folder with name='{}', parentId={}, repositoryKey='{}'", name, parentId, repositoryKey);

        try {
            KnowledgeFileDTO dto = new KnowledgeFileDTO();
            dto.setName(name);
            dto.setType(FileType.FOLDER);
            dto.setParentId(parentId != null ? parentId : 0L);
            dto.setRepositoryKey(repositoryKey);

            fileApplication.createFile(dto);

            // Retrieve the created folder to return its ID
            List<KnowledgeFile> folders = fileService.lambdaQuery()
                    .eq(KnowledgeFile::getName, name)
                    .eq(KnowledgeFile::getType, FileType.FOLDER)
                    .eq(KnowledgeFile::getParentId, parentId != null ? parentId : 0L)
                    .orderByDesc(KnowledgeFile::getCreateTime)
                    .last("LIMIT 1")
                    .list();

            StringBuilder result = new StringBuilder();
            result.append("# Folder Created\n\n");
            result.append("**Name:** ").append(name).append("\n");
            if (!folders.isEmpty()) {
                KnowledgeFile folder = folders.get(0);
                result.append("**Folder ID:** ").append(folder.getId()).append("\n");
                result.append("**Parent ID:** ").append(folder.getParentId()).append("\n");
                if (StrUtil.isNotBlank(folder.getRepositoryKey())) {
                    result.append("**Repository:** ").append(folder.getRepositoryKey()).append("\n");
                }
            }
            result.append("\nFolder created successfully.");

            log.info("Folder '{}' created successfully", name);
            return result.toString();
        } catch (Exception e) {
            log.error("Error creating folder '{}'", name, e);
            return "Error creating folder: " + e.getMessage();
        }
    }

    /**
     * Rename a file or folder.
     *
     * @param fileId  the file or folder ID
     * @param newName the new name
     * @return result message
     */
    @SkillTool(name = "rename_file", description = "Rename a file or folder. "
            +
            "Provide the file/folder ID and the new name. Returns the updated file info.")
    public String renameFile(
            @ToolParam(name = "fileId", description = "The ID of the file or folder to rename", type = "number", required = true) Long fileId,
            @ToolParam(name = "newName", description = "The new name for the file or folder", type = "string", required = true) String newName) {
        if (fileId == null) {
            return "Error: Missing required parameter: fileId";
        }
        if (StrUtil.isBlank(newName)) {
            return "Error: Missing required parameter: newName";
        }

        log.info("Renaming file/folder id={} to '{}'", fileId, newName);

        try {
            KnowledgeFile existing = fileService.getById(fileId);
            if (existing == null) {
                return "Error: File or folder not found with id=" + fileId;
            }

            String oldName = existing.getName();
            fileApplication.renameFile(fileId, newName);

            StringBuilder result = new StringBuilder();
            result.append("# Rename Successful\n\n");
            result.append("**File ID:** ").append(fileId).append("\n");
            result.append("**Old Name:** ").append(oldName).append("\n");
            result.append("**New Name:** ").append(newName).append("\n");
            result.append("**Type:** ").append(existing.getType() != null ? existing.getType().name() : "UNKNOWN")
                    .append("\n");

            log.info("File/folder id={} renamed from '{}' to '{}'", fileId, oldName, newName);
            return result.toString();
        } catch (Exception e) {
            log.error("Error renaming file/folder id={}", fileId, e);
            return "Error renaming file/folder: " + e.getMessage();
        }
    }

    /**
     * Move a file or folder to another folder.
     *
     * @param sourceId the ID of the file or folder to move
     * @param targetId the ID of the target folder
     * @return result message
     */
    @SkillTool(name = "move_file", description = "Move a file or folder to another folder. "
            +
            "Provide the source file/folder ID and the target folder ID. "
            +
            "The target must be a valid folder. Returns the move result.")
    public String moveFile(
            @ToolParam(name = "sourceId", description = "The ID of the file or folder to move", type = "number", required = true) Long sourceId,
            @ToolParam(name = "targetId", description = "The ID of the target folder to move into", type = "number", required = true) Long targetId) {
        if (sourceId == null) {
            return "Error: Missing required parameter: sourceId";
        }
        if (targetId == null) {
            return "Error: Missing required parameter: targetId";
        }

        log.info("Moving file/folder id={} to folder id={}", sourceId, targetId);

        try {
            KnowledgeFile source = fileService.getById(sourceId);
            if (source == null) {
                return "Error: Source file or folder not found with id=" + sourceId;
            }

            KnowledgeFile target = fileService.getById(targetId);
            if (target == null) {
                return "Error: Target folder not found with id=" + targetId;
            }
            if (target.getType() != FileType.FOLDER) {
                return "Error: Target id=" + targetId + " is not a folder. You can only move items into folders.";
            }

            MoveFileDTO dto = new MoveFileDTO();
            dto.setSourceId(sourceId);
            dto.setTargetId(targetId);
            fileApplication.moveFile(dto);

            StringBuilder result = new StringBuilder();
            result.append("# Move Successful\n\n");
            result.append("**Moved Item:** ").append(source.getName())
                    .append(" (").append(source.getType() != null ? source.getType().name() : "UNKNOWN").append(")")
                    .append("\n");
            result.append("**Source ID:** ").append(sourceId).append("\n");
            result.append("**Target Folder:** ").append(target.getName()).append("\n");
            result.append("**Target Folder ID:** ").append(targetId).append("\n");

            log.info("File/folder id={} moved to folder id={}", sourceId, targetId);
            return result.toString();
        } catch (Exception e) {
            log.error("Error moving file/folder id={} to folder id={}", sourceId, targetId, e);
            return "Error moving file/folder: " + e.getMessage();
        }
    }

    /**
     * List files and sub-folders inside a folder.
     *
     * @param folderId      the folder ID (0 for root)
     * @param repositoryKey the repository key (null for default)
     * @return formatted list of items in the folder
     */
    @SkillTool(name = "list_folder", description = "List files and sub-folders inside a folder. "
            +
            "Provide the folder ID (use 0 for root level) and optionally the repository key. "
            +
            "Returns a list of items with their IDs, names, types, and sizes.")
    public String listFolder(
            @ToolParam(name = "folderId", description = "The folder ID to list contents for. If not provided, lists root level of the default repository.", type = "number", required = false) Long folderId,
            @ToolParam(name = "repositoryKey", description = "The repository key. Leave empty to use the default repository.", type = "string", required = false) String repositoryKey) {

        log.info("Listing folder contents for folderId={}, repositoryKey='{}'", folderId, repositoryKey);

        try {
            List<KnowledgeFile> children;
            long effectiveFolderId;

            if (folderId != null) {
                effectiveFolderId = folderId;
                children = fileService.getChildren(effectiveFolderId, true, null, null);
            } else {
                // No folderId provided: use default repository key to list root level
                String effectiveRepoKey = repositoryKey;
                if (StrUtil.isBlank(effectiveRepoKey)) {
                    IFileRepositoryService repoService = fileService.getFileRepositoryService();
                    if (repoService != null) {
                        KnowledgeFileRepository defaultRepo = repoService.getDefaultFileRepo();
                        if (defaultRepo != null && StrUtil.isNotBlank(defaultRepo.getRepoKey())) {
                            effectiveRepoKey = defaultRepo.getRepoKey();
                        }
                    }
                    if (StrUtil.isBlank(effectiveRepoKey)) {
                        return "Error: Unable to determine default repository. Please provide a repositoryKey.";
                    }
                }
                effectiveFolderId = 0L;
                children = fileService.lambdaQuery()
                        .eq(KnowledgeFile::getParentId, effectiveFolderId)
                        .eq(KnowledgeFile::getRepositoryKey, effectiveRepoKey)
                        .list();
            }

            StringBuilder result = new StringBuilder();
            result.append("# Folder Contents\n\n");
            result.append("**Folder ID:** ").append(effectiveFolderId).append("\n\n");

            if (children == null || children.isEmpty()) {
                result.append("This folder is empty.\n");
                return result.toString();
            }

            result.append("**Total Items:** ").append(children.size()).append("\n\n");

            for (int i = 0; i < children.size(); i++) {
                KnowledgeFile item = children.get(i);
                String itemName = item.getName() != null ? item.getName() : "Unnamed";
                String itemType = item.getType() != null ? item.getType().name() : "UNKNOWN";

                result.append(i + 1).append(". **").append(itemName).append("**\n");
                result.append("   - ID: ").append(item.getId()).append("\n");
                result.append("   - Type: ").append(itemType).append("\n");
                if (item.getType() == FileType.FILE && item.getSize() != null) {
                    result.append("   - Size: ").append(item.getSize()).append(" bytes\n");
                }
                if (StrUtil.isNotBlank(item.getSuffix())) {
                    result.append("   - Extension: ").append(item.getSuffix()).append("\n");
                }
                result.append("\n");
            }

            log.info("Listed {} items in folder id={}", children.size(), effectiveFolderId);
            return result.toString();
        } catch (Exception e) {
            return "Error listing folder contents: " + e.getMessage();
        }
    }

    /**
     * Get detailed information about a file or folder.
     *
     * @param fileId the file or folder ID
     * @return formatted file details
     */
    @SkillTool(name = "get_file_info", description = "Get detailed information about a file or folder. "
            +
            "Returns the item's ID, name, type, size, parent, repository, and other metadata.")
    public String getFileInfo(
            @ToolParam(name = "fileId", description = "The file or folder ID to get details for", type = "number", required = true) Long fileId) {
        if (fileId == null) {
            return "Error: Missing required parameter: fileId";
        }

        log.info("Getting file info for fileId={}", fileId);

        try {
            KnowledgeFileVO fileVO = fileApplication.getById(fileId);
            if (fileVO == null) {
                return "Error: File or folder not found with id=" + fileId;
            }

            StringBuilder result = new StringBuilder();
            result.append("# File/Folder Details\n\n");
            result.append("**ID:** ").append(fileVO.getId()).append("\n");
            result.append("**Name:** ").append(fileVO.getName()).append("\n");
            result.append("**Type:** ").append(fileVO.getType() != null ? fileVO.getType().name() : "UNKNOWN")
                    .append("\n");
            result.append("**Parent ID:** ").append(fileVO.getParentId()).append("\n");
            if (StrUtil.isNotBlank(fileVO.getRepositoryKey())) {
                result.append("**Repository:** ").append(fileVO.getRepositoryKey()).append("\n");
            }
            if (fileVO.getSize() != null) {
                result.append("**Size:** ").append(fileVO.getSize()).append(" bytes\n");
            }
            if (StrUtil.isNotBlank(fileVO.getSuffix())) {
                result.append("**Extension:** ").append(fileVO.getSuffix()).append("\n");
            }
            if (StrUtil.isNotBlank(fileVO.getPath())) {
                result.append("**Path:** ").append(fileVO.getPath()).append("\n");
            }
            if (StrUtil.isNotBlank(fileVO.getFileKey())) {
                result.append("**File Key:** ").append(fileVO.getFileKey()).append("\n");
            }
            if (StrUtil.isNotBlank(fileVO.getAncestors())) {
                result.append("**Ancestors:** ").append(fileVO.getAncestors()).append("\n");
            }
            if (fileVO.getCreateTime() != null) {
                result.append("**Created:** ").append(fileVO.getCreateTime()).append("\n");
            }
            if (fileVO.getUpdateTime() != null) {
                result.append("**Updated:** ").append(fileVO.getUpdateTime()).append("\n");
            }

            log.info("File info retrieved for fileId={}", fileId);
            return result.toString();
        } catch (Exception e) {
            log.error("Error getting file info for fileId={}", fileId, e);
            return "Error getting file info: " + e.getMessage();
        }
    }

    /**
     * Delete a file or folder.
     *
     * @param fileId the file or folder ID
     * @return result message
     */
    @SkillTool(name = "delete_file", description = "Delete a file or folder. "
            +
            "If the target is a folder, all its contents will be deleted recursively. "
            +
            "This action cannot be undone. Returns the deletion result.")
    public String deleteFile(
            @ToolParam(name = "fileId", description = "The ID of the file or folder to delete", type = "number", required = true) Long fileId) {
        if (fileId == null) {
            return "Error: Missing required parameter: fileId";
        }

        log.info("Deleting file/folder id={}", fileId);

        try {
            KnowledgeFile existing = fileService.getById(fileId);
            if (existing == null) {
                return "Error: File or folder not found with id=" + fileId;
            }

            String itemName = existing.getName();
            String itemType = existing.getType() != null ? existing.getType().name() : "UNKNOWN";

            fileApplication.deleteFile(fileId);

            StringBuilder result = new StringBuilder();
            result.append("# Deletion Successful\n\n");
            result.append("**Deleted Item:** ").append(itemName).append("\n");
            result.append("**Type:** ").append(itemType).append("\n");
            result.append("**ID:** ").append(fileId).append("\n");
            if (existing.getType() == FileType.FOLDER) {
                result.append("\nNote: All contents inside the folder have also been deleted.");
            }

            log.info("File/folder id={} ('{}') deleted successfully", fileId, itemName);
            return result.toString();
        } catch (Exception e) {
            log.error("Error deleting file/folder id={}", fileId, e);
            return "Error deleting file/folder: " + e.getMessage();
        }
    }
}
