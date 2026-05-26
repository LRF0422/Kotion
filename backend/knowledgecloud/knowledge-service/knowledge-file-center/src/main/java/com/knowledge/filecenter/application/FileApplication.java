package com.knowledge.filecenter.application;

import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.net.URLEncoder;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import javax.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.knowledge.core.oss.OssClient;
import com.knowledge.core.oss.props.OssProperties;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import com.knowledge.file.api.entity.dto.KnowledgeFileDTO;
import com.knowledge.file.api.entity.dto.KnowledgeFileRepositoryDTO;
import com.knowledge.file.api.entity.dto.MoveFileDTO;
import com.knowledge.file.api.entity.dto.QueryFileDTO;
import com.knowledge.file.api.entity.enums.FileType;
import com.knowledge.filecenter.converter.KnowledgeFileConverter;
import com.knowledge.filecenter.converter.KnowledgeFileRepositoryConverter;
import com.knowledge.filecenter.entity.KnowledgeFile;
import com.knowledge.filecenter.entity.KnowledgeFileRepository;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;
import com.knowledge.filecenter.service.IFileRepositoryService;
import com.knowledge.filecenter.service.IFileService;
import cn.hutool.core.io.IoUtil;
import cn.hutool.core.lang.tree.Tree;
import cn.hutool.core.util.StrUtil;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class FileApplication {

    @Autowired
    private IFileService fileService;
    @Autowired
    private IFileRepositoryService repositoryService;
    @Autowired(required = false)
    private OssClient ossClient;
    @Autowired(required = false)
    private OssProperties ossProperties;

    public void createFileRepository(KnowledgeFileRepositoryDTO dto) {
        KnowledgeFileRepository repository = KnowledgeFileRepositoryConverter.INSTANCE.convertDO(dto);
        repositoryService.createOrSave(repository);
    }

    public void createFile(KnowledgeFileDTO dto) {
        KnowledgeFile file = KnowledgeFileConverter.INSTANCE.convertDO(dto);
        if (StrUtil.isBlank(file.getRepositoryKey())) {
            KnowledgeFileRepository repository = repositoryService.getDefaultFileRepo();
            file.setRepositoryKey(repository.getRepoKey());
        }
        this.fileService.createOrSaveFile(file);
    }

    public List<Tree<Long>> getRootFolder() {
        return this.fileService.getRootFolderTree();
    }

    public List<Tree<Long>> folderTree(String repositoryKey) {
        return fileService.folderTree(repositoryKey, false);
    }

    public List<KnowledgeFileVO> getChildren(QueryFileDTO dto) {
        return KnowledgeFileConverter.INSTANCE.convertVO(
                fileService.getChildren(dto.getFolderId(), true, dto.getMediaType(), dto.getFileName()));
    }

    public KnowledgeFileVO getById(Long fileId) {
        return KnowledgeFileConverter.INSTANCE.convertVO(
                this.fileService.getById(fileId));
    }

    public void moveFile(MoveFileDTO dto) {
        fileService.moveFile(dto.getSourceId(), dto.getTargetId());
    }

    /**
     * Upload a single file to OSS and create file record
     */
    @SneakyThrows
    @Transactional(rollbackFor = Exception.class)
    public KnowledgeFileVO uploadFile(MultipartFile file, Long parentId, String repositoryKey) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File cannot be empty");
        }
        if (ossClient == null) {
            throw new IllegalStateException("OSS client is not configured");
        }

        // Upload file to OSS
        com.knowledge.core.oss.model.KnowledgeFile ossFile = ossClient.putFile(file);

        // Create file record in database
        KnowledgeFile knowledgeFile = new KnowledgeFile();
        knowledgeFile.setType(FileType.FILE);
        knowledgeFile.setName(file.getOriginalFilename());
        knowledgeFile.setParentId(parentId);
        knowledgeFile.setSize((int) file.getSize());
        knowledgeFile.setPath(ossFile.getLink());
        knowledgeFile.setFileKey(ossFile.getName());

        if (StrUtil.isBlank(repositoryKey)) {
            KnowledgeFileRepository repository = repositoryService.getDefaultFileRepo();
            knowledgeFile.setRepositoryKey(repository.getRepoKey());
        } else {
            knowledgeFile.setRepositoryKey(repositoryKey);
        }

        fileService.createOrSaveFile(knowledgeFile);

        return KnowledgeFileConverter.INSTANCE.convertVO(knowledgeFile);
    }

    /**
     * Batch upload files
     */
    @Transactional(rollbackFor = Exception.class)
    public List<KnowledgeFileVO> batchUploadFiles(MultipartFile[] files, Long parentId, String repositoryKey) {
        if (files == null || files.length == 0) {
            throw new IllegalArgumentException("Files cannot be empty");
        }

        List<KnowledgeFileVO> result = new ArrayList<>();
        for (MultipartFile file : files) {
            try {
                KnowledgeFileVO fileVO = uploadFile(file, parentId, repositoryKey);
                result.add(fileVO);
            } catch (Exception e) {
                log.error("Failed to upload file: {}", file.getOriginalFilename(), e);
                // Continue with other files
            }
        }

        return result;
    }

    /**
     * Download file from OSS
     */
    @SneakyThrows
    public void downloadFile(Long fileId, HttpServletResponse response) {
        KnowledgeFile file = fileService.getById(fileId);
        if (file == null) {
            throw new IllegalArgumentException("File not found");
        }
        if (file.getType() != FileType.FILE) {
            throw new IllegalArgumentException("Cannot download a folder");
        }
        if (ossClient == null) {
            throw new IllegalStateException("OSS client is not configured");
        }

        // Download file from OSS
        InputStream inputStream = ossClient.downloadFile(file.getFileKey());

        // Set response headers
        response.setContentType("application/octet-stream");
        response.setCharacterEncoding("UTF-8");
        String encodedFileName = URLEncoder.encode(file.getName(), StandardCharsets.UTF_8.name());
        response.setHeader("Content-Disposition", "attachment; filename=" + encodedFileName);

        // Write file to response
        IoUtil.copy(inputStream, response.getOutputStream());
        IoUtil.close(inputStream);
    }

    /**
     * Update file metadata
     */
    @Transactional(rollbackFor = Exception.class)
    public void updateFile(KnowledgeFileDTO dto) {
        KnowledgeFile file = KnowledgeFileConverter.INSTANCE.convertDO(dto);
        fileService.createOrSaveFile(file);
    }

    /**
     * Rename file or folder
     */
    @Transactional(rollbackFor = Exception.class)
    public void renameFile(Long fileId, String newName) {
        if (StrUtil.isBlank(newName)) {
            throw new IllegalArgumentException("New name cannot be empty");
        }

        KnowledgeFile file = fileService.getById(fileId);
        if (file == null) {
            throw new IllegalArgumentException("File not found");
        }

        file.setName(newName);
        fileService.createOrSaveFile(file);
    }

    /**
     * Delete file or folder
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteFile(Long fileId) {
        KnowledgeFile file = fileService.getById(fileId);
        if (file == null) {
            throw new IllegalArgumentException("File not found");
        }

        // If it's a file, delete from OSS
        if (file.getType() == FileType.FILE && ossClient != null && StrUtil.isNotBlank(file.getFileKey())) {
            try {
                ossClient.removeFile(file.getFileKey());
            } catch (Exception e) {
                log.error("Failed to delete file from OSS: {}", file.getFileKey(), e);
            }
        }

        // If it's a folder, delete all children recursively
        if (file.getType() == FileType.FOLDER) {
            List<KnowledgeFile> children = fileService.getChildren(fileId, false, null, null);
            for (KnowledgeFile child : children) {
                deleteFile(child.getId());
            }
        }

        // Delete from database
        fileService.removeById(fileId);
    }

    /**
     * Batch delete files
     */
    @Transactional(rollbackFor = Exception.class)
    public void batchDeleteFiles(List<Long> fileIds) {
        if (fileIds == null || fileIds.isEmpty()) {
            throw new IllegalArgumentException("File IDs cannot be empty");
        }

        for (Long fileId : fileIds) {
            try {
                deleteFile(fileId);
            } catch (Exception e) {
                log.error("Failed to delete file: {}", fileId, e);
                // Continue with other files
            }
        }
    }

    /**
     * Download file from a URL and save to a specified folder.
     * The file is uploaded to OSS and a file record is created in the database.
     *
     * @param fileUrl       the URL of the file to download
     * @param fileName      the name for the saved file (if null, derived from URL)
     * @param parentId      the parent folder ID (null for root)
     * @param repositoryKey the repository key (null for default)
     * @return the created file VO
     */
    @SneakyThrows
    @Transactional(rollbackFor = Exception.class)
    public KnowledgeFileVO downloadFromUrl(String fileUrl, String fileName, Long parentId, String repositoryKey) {
        if (StrUtil.isBlank(fileUrl)) {
            throw new IllegalArgumentException("File URL cannot be empty");
        }
        if (ossClient == null) {
            throw new IllegalStateException("OSS client is not configured");
        }

        // Derive file name from URL if not provided
        if (StrUtil.isBlank(fileName)) {
            String path = new URL(fileUrl).getPath();
            fileName = path.substring(path.lastIndexOf('/') + 1);
            if (StrUtil.isBlank(fileName)) {
                fileName = "downloaded_file";
            }
        }

        // Download file from URL using Hutool HttpRequest for proper User-Agent,
        // redirect handling, and better error messages.
        // Plain URL.openStream() sends no User-Agent and gets blocked by many servers.
        // Also adds Referer and Accept headers to satisfy anti-hotlink and bot detection.
        String referer = "";
        try {
            URL urlObj = new URL(fileUrl);
            referer = urlObj.getProtocol() + "://" + urlObj.getHost() + "/";
        } catch (Exception ignored) {
        }

        byte[] fileBytes;
        try (HttpResponse response = HttpRequest.get(fileUrl)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        + "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                .header("Referer", referer)
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
                .header("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7")
                .timeout(30_000)
                .setFollowRedirects(true)
                .execute()) {

            if (!response.isOk()) {
                throw new RuntimeException("Failed to download file from URL: " + fileUrl
                        + ", HTTP status: " + response.getStatus());
            }

            fileBytes = response.bodyBytes();
        }

        return saveDownloadedFile(fileBytes, fileName, parentId, repositoryKey);
    }

    /**
     * Save already-downloaded file bytes to OSS and create a file record.
     * Use this when the caller has already downloaded the file (e.g., with custom
     * headers or size checks) to avoid downloading the same URL twice.
     *
     * @param fileBytes     the raw file content bytes
     * @param fileName      the name for the saved file
     * @param parentId      the parent folder ID (null for root)
     * @param repositoryKey the repository key (null for default)
     * @return the created file VO
     */
    @Transactional(rollbackFor = Exception.class)
    public KnowledgeFileVO saveDownloadedFile(byte[] fileBytes, String fileName, Long parentId, String repositoryKey) {
        if (fileBytes == null || fileBytes.length == 0) {
            throw new IllegalArgumentException("File bytes cannot be empty");
        }
        if (ossClient == null) {
            throw new IllegalStateException("OSS client is not configured");
        }

        // Upload to OSS
        String ossFileName = cn.hutool.core.lang.UUID.fastUUID().toString() + "_" + fileName;
        ByteArrayInputStream bais = new ByteArrayInputStream(fileBytes);
        String bucketName = ossProperties != null ? ossProperties.getBucketName() : "knowledgex";
        com.knowledge.core.oss.model.KnowledgeFile ossFile = ossClient.putFile(bucketName, ossFileName, bais);

        // Create file record in database
        KnowledgeFile knowledgeFile = new KnowledgeFile();
        knowledgeFile.setType(FileType.FILE);
        knowledgeFile.setName(fileName);
        knowledgeFile.setParentId(parentId != null ? parentId : 0L);
        knowledgeFile.setSize(fileBytes.length);
        knowledgeFile.setPath(ossFile.getLink());
        knowledgeFile.setFileKey(ossFile.getName());

        if (StrUtil.isBlank(repositoryKey)) {
            KnowledgeFileRepository repository = repositoryService.getDefaultFileRepo();
            knowledgeFile.setRepositoryKey(repository.getRepoKey());
        } else {
            knowledgeFile.setRepositoryKey(repositoryKey);
        }

        fileService.createOrSaveFile(knowledgeFile);

        return KnowledgeFileConverter.INSTANCE.convertVO(knowledgeFile);
    }

    /**
     * Search files by keyword
     */
    public List<KnowledgeFileVO> searchFiles(String keyword, String repositoryKey) {
        if (StrUtil.isBlank(keyword)) {
            return new ArrayList<>();
        }

        List<KnowledgeFile> files = fileService.lambdaQuery()
                .like(KnowledgeFile::getName, keyword)
                .eq(StrUtil.isNotBlank(repositoryKey), KnowledgeFile::getRepositoryKey, repositoryKey)
                .list();

        return files.stream()
                .map(KnowledgeFileConverter.INSTANCE::convertVO)
                .collect(Collectors.toList());
    }

}
