package com.knowledge.filecenter.application;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.net.URLEncoder;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import javax.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.baomidou.mybatisplus.core.metadata.IPage;
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
import com.knowledge.filecenter.document.OoxmlTextExtractor;
import com.knowledge.filecenter.entity.KnowledgeFile;
import com.knowledge.filecenter.entity.KnowledgeFileRepository;
import com.knowledge.filecenter.entity.vo.FileAccessUrlsVO;
import com.knowledge.filecenter.entity.vo.FileContentVO;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;
import com.knowledge.filecenter.service.IFileRepositoryService;
import com.knowledge.filecenter.service.IFileService;
import com.knowledge.filecenter.service.RemoteFileDownloadService;
import com.knowledge.filecenter.service.RemoteFileDownloadService.DownloadedFile;
import com.knowledge.filecenter.storage.LegacyOssObjectKeyResolver;
import com.knowledge.filecenter.upload.UploadOwner;
import com.knowledge.filecenter.upload.UploadOwnerProvider;
import cn.hutool.core.io.IoUtil;
import cn.hutool.core.lang.tree.Tree;
import cn.hutool.core.util.StrUtil;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

@Service
@Slf4j
public class FileApplication {

    private static final Duration FILE_ACCESS_URL_EXPIRY = Duration.ofHours(1);

    /** Default number of characters returned when reading a text file. */
    private static final int DEFAULT_READ_MAX_CHARS = 4000;
    /** Hard upper bound for the requested read length. */
    private static final int MAX_READ_MAX_CHARS = 50000;
    /** Number of leading bytes inspected when sniffing whether content is text. */
    private static final int TEXT_SNIFF_BYTES = 8192;

    private static final Set<String> TEXT_FILE_SUFFIXES = new HashSet<>(Arrays.asList(
            "txt", "text", "md", "markdown", "json", "json5", "xml", "svg", "yaml", "yml", "toml", "ini", "conf",
            "cfg", "properties", "env", "csv", "tsv", "log", "html", "htm", "css", "scss", "less", "js", "jsx",
            "mjs", "cjs", "ts", "tsx", "vue", "svelte", "java", "kt", "kts", "groovy", "scala", "py", "rb", "php",
            "go", "rs", "c", "h", "cc", "cpp", "hpp", "cs", "swift", "sh", "bash", "zsh", "bat", "cmd", "ps1",
            "sql", "graphql", "proto", "gradle", "gitignore", "editorconfig"));

    private static final Set<String> BINARY_FILE_SUFFIXES = new HashSet<>(Arrays.asList(
            "png", "jpg", "jpeg", "gif", "bmp", "webp", "ico", "svgz", "tif", "tiff", "psd", "pdf", "doc", "docx",
            "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "zip", "rar", "7z", "gz", "tar", "bz2", "xz",
            "mp3", "wav", "flac", "aac", "ogg", "m4a", "mp4", "mov", "avi", "mkv", "webm", "wmv", "flv", "woff",
            "woff2", "ttf", "otf", "eot", "exe", "dll", "so", "dylib", "bin", "class", "jar", "war", "apk", "ipa"));

    @Autowired
    private IFileService fileService;
    @Autowired
    private IFileRepositoryService repositoryService;
    @Autowired(required = false)
    private OssClient ossClient;
    @Autowired(required = false)
    private OssProperties ossProperties;
    @Autowired(required = false)
    private S3Presigner s3Presigner;
    @Autowired
    private LegacyOssObjectKeyResolver ossObjectKeyResolver;
    @Autowired
    private UploadOwnerProvider ownerProvider;
    @Autowired
    private RemoteFileDownloadService remoteFileDownloadService;

    public void createFileRepository(KnowledgeFileRepositoryDTO dto) {
        KnowledgeFileRepository repository = KnowledgeFileRepositoryConverter.INSTANCE.convertDO(dto);
        repositoryService.createOrSave(repository);
    }

    public KnowledgeFileVO createFile(KnowledgeFileDTO dto) {
        KnowledgeFile file = KnowledgeFileConverter.INSTANCE.convertDO(dto);
        if (StrUtil.isBlank(file.getRepositoryKey())) {
            KnowledgeFileRepository repository = repositoryService.getDefaultFileRepo();
            file.setRepositoryKey(repository.getRepoKey());
        }
        return KnowledgeFileConverter.INSTANCE.convertVO(this.fileService.createOrSaveFile(file));
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
        KnowledgeFile file = this.fileService.getById(fileId);
        if (file != null && file.getType() == FileType.FILE) {
            file = fileService.touchAccess(fileId);
        }
        return KnowledgeFileConverter.INSTANCE.convertVO(file);
    }

    public IPage<KnowledgeFileVO> getChildrenPage(QueryFileDTO dto) {
        IPage<KnowledgeFile> page = fileService.getChildrenPage(dto);
        return page.convert(KnowledgeFileConverter.INSTANCE::convertVO);
    }

    public void moveFile(MoveFileDTO dto) {
        fileService.moveFile(dto.getSourceId(), dto.getTargetId());
    }

    public KnowledgeFileVO copyFile(Long fileId, Long targetParentId) {
        return KnowledgeFileConverter.INSTANCE.convertVO(
                fileService.copyFile(fileId, targetParentId));
    }

    // ===== 回收站 / 收藏 / 最近访问 =====

    public void restore(Long fileId) {
        fileService.restore(fileId);
    }

    public List<KnowledgeFileVO> listTrash() {
        return KnowledgeFileConverter.INSTANCE.convertVO(fileService.listTrash());
    }

    public void toggleFavorite(Long fileId, boolean favorite) {
        fileService.toggleFavorite(fileId, favorite);
    }

    public List<KnowledgeFileVO> listFavorites() {
        return KnowledgeFileConverter.INSTANCE.convertVO(fileService.listFavorites());
    }

    public List<KnowledgeFileVO> listRecent(int limit) {
        return KnowledgeFileConverter.INSTANCE.convertVO(fileService.listRecent(limit));
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
        knowledgeFile.setSize(file.getSize());
        knowledgeFile.setPath(ossFile.getName());

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

        // Download file from OSS using the canonical object key stored in path.
        String objectKey = ossObjectKeyResolver.resolve(file.getPath());
        InputStream inputStream = ossClient.downloadFile(objectKey);

        // Set response headers
        response.setContentType("application/octet-stream");
        response.setCharacterEncoding("UTF-8");
        String encodedFileName = URLEncoder.encode(file.getName(), StandardCharsets.UTF_8.name());
        response.setHeader("Content-Disposition", "attachment; filename=" + encodedFileName);

        // Write file to response
        IoUtil.copy(inputStream, response.getOutputStream());
        IoUtil.close(inputStream);

        // 记录最近访问
        fileService.touchAccess(fileId);
    }

    /**
     * Create short-lived direct access URLs for native media playback and downloads.
     */
    @SneakyThrows
    public FileAccessUrlsVO createAccessUrls(Long fileId) {
        KnowledgeFile file = requireAccessibleFile(fileId);
        if (s3Presigner == null || ossProperties == null || StrUtil.isBlank(ossProperties.getBucketName())) {
            throw new IllegalStateException("OSS presigner is not configured");
        }

        String objectKey = ossObjectKeyResolver.resolve(file.getPath());
        if (StrUtil.isBlank(objectKey)) {
            throw new IllegalStateException("File object key is not available");
        }

        String encodedFileName = URLEncoder.encode(file.getName(), StandardCharsets.UTF_8.name())
                .replace("+", "%20");
        String inlineDisposition = "inline; filename*=UTF-8''" + encodedFileName;
        String attachmentDisposition = "attachment; filename*=UTF-8''" + encodedFileName;
        Instant expiresAt = Instant.now().plus(FILE_ACCESS_URL_EXPIRY);

        FileAccessUrlsVO result = FileAccessUrlsVO.builder()
                .previewUrl(signGetUrl(objectKey, inlineDisposition))
                .downloadUrl(signGetUrl(objectKey, attachmentDisposition))
                .expiresAt(expiresAt)
                .build();
        fileService.touchAccess(fileId);
        return result;
    }

    private KnowledgeFile requireAccessibleFile(Long fileId) {
        UploadOwner owner = ownerProvider.currentOwner();
        KnowledgeFile file = fileService.getById(fileId);
        if (file == null
                || file.getType() != FileType.FILE
                || Integer.valueOf(1).equals(file.getTrashed())
                || !Objects.equals(owner.getTenantId(), file.getTenantId())) {
            throw new IllegalArgumentException("File not found");
        }
        return file;
    }

    private String signGetUrl(String objectKey, String contentDisposition) {
        GetObjectRequest objectRequest = GetObjectRequest.builder()
                .bucket(ossProperties.getBucketName())
                .key(objectKey)
                .responseContentDisposition(contentDisposition)
                .build();
        return s3Presigner.presignGetObject(GetObjectPresignRequest.builder()
                .signatureDuration(FILE_ACCESS_URL_EXPIRY)
                .getObjectRequest(objectRequest)
                .build()).url().toString();
    }

    /**
     * Read a file's bytes from object storage and return its text content when possible.
     * <p>
     * Text-like files are decoded as UTF-8, Office Open XML documents (.docx/.pptx/.xlsx)
     * are text-extracted, and the result is truncated to the requested length. Other
     * binary files only carry metadata plus a message explaining why no text was returned.
     *
     * @param fileId   the file-center record id
     * @param maxChars optional maximum number of characters to return (defaults to 4000)
     * @return content metadata plus decoded text for text files
     */
    @SneakyThrows
    public FileContentVO readFileContent(Long fileId, Integer maxChars) {
        KnowledgeFile file = requireAccessibleFile(fileId);
        if (ossClient == null) {
            throw new IllegalStateException("OSS client is not configured");
        }

        FileContentVO result = new FileContentVO();
        result.setId(file.getId());
        result.setName(file.getName());
        result.setSuffix(file.getSuffix());
        result.setMediaType(file.getMediaType());
        result.setSize(file.getSize());

        String objectKey = ossObjectKeyResolver.resolve(file.getPath());
        if (StrUtil.isBlank(objectKey)) {
            result.setMessage("File object key is not available");
            return result;
        }

        byte[] bytes;
        try (InputStream inputStream = ossClient.downloadFile(objectKey)) {
            bytes = IoUtil.readBytes(inputStream);
        }

        String officeText = OoxmlTextExtractor.extract(bytes, file.getSuffix());
        if (officeText != null) {
            if (officeText.trim().isEmpty()) {
                result.setMessage("No extractable text was found in this document.");
                return result;
            }
            applyTextContent(result, officeText, maxChars);
            fileService.touchAccess(fileId);
            return result;
        }

        if (!isTextFile(file.getSuffix(), bytes)) {
            result.setMessage("This file is binary (suffix=" + StrUtil.blankToDefault(file.getSuffix(), "none")
                    + ", size=" + bytes.length + " bytes) and cannot be read as text.");
            return result;
        }

        applyTextContent(result, new String(bytes, StandardCharsets.UTF_8), maxChars);
        fileService.touchAccess(fileId);
        return result;
    }

    private static void applyTextContent(FileContentVO result, String decoded, Integer maxChars) {
        String text = decoded;
        if (!text.isEmpty() && (int) text.charAt(0) == 0xFEFF) {
            text = text.substring(1);
        }
        int limit = resolveReadLimit(maxChars);
        boolean truncated = text.length() > limit;
        result.setText(true);
        result.setEncoding("utf-8");
        result.setTruncated(truncated);
        result.setContent(truncated ? text.substring(0, limit) : text);
    }

    private static int resolveReadLimit(Integer maxChars) {
        if (maxChars == null || maxChars <= 0) {
            return DEFAULT_READ_MAX_CHARS;
        }
        return Math.min(maxChars, MAX_READ_MAX_CHARS);
    }

    private static boolean isTextFile(String suffix, byte[] bytes) {
        String normalized = suffix == null ? "" : suffix.toLowerCase();
        if (TEXT_FILE_SUFFIXES.contains(normalized)) {
            return true;
        }
        if (BINARY_FILE_SUFFIXES.contains(normalized)) {
            return false;
        }
        return looksLikeText(bytes);
    }

    private static boolean looksLikeText(byte[] bytes) {
        int sampleSize = Math.min(bytes.length, TEXT_SNIFF_BYTES);
        if (sampleSize == 0) {
            return true;
        }
        int suspicious = 0;
        for (int index = 0; index < sampleSize; index++) {
            int value = bytes[index] & 0xFF;
            if (value == 0) {
                return false;
            }
            if (value < 0x09 || (value > 0x0D && value < 0x20)) {
                suspicious++;
            }
        }
        return suspicious * 10 <= sampleSize;
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
     * Delete file or folder —— 软删除,移入回收站(可还原)。
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteFile(Long fileId) {
        fileService.moveToTrash(fileId);
    }

    /**
     * Batch delete files —— 批量移入回收站
     */
    @Transactional(rollbackFor = Exception.class)
    public void batchDeleteFiles(List<Long> fileIds) {
        if (fileIds == null || fileIds.isEmpty()) {
            throw new IllegalArgumentException("File IDs cannot be empty");
        }

        for (Long fileId : fileIds) {
            try {
                fileService.moveToTrash(fileId);
            } catch (Exception e) {
                log.error("Failed to move file to trash: {}", fileId, e);
                // Continue with other files
            }
        }
    }

    /**
     * 永久删除(从回收站彻底移除,删除 OSS 对象,文件夹递归)
     */
    @Transactional(rollbackFor = Exception.class)
    public void purge(Long fileId) {
        KnowledgeFile file = fileService.getById(fileId);
        if (file == null) {
            throw new IllegalArgumentException("File not found");
        }

        // Delete the OSS object only when this is its final database reference.
        if (file.getType() == FileType.FILE && ossClient != null) {
            if (StrUtil.isBlank(file.getPath())) {
                log.warn("Skip OSS deletion because file path is missing: fileId={}", file.getId());
            } else {
                long remainingReferences = fileService.lambdaQuery()
                        .eq(KnowledgeFile::getPath, file.getPath())
                        .ne(KnowledgeFile::getId, file.getId())
                        .count();
                if (remainingReferences == 0) {
                    try {
                        String objectKey = ossObjectKeyResolver.resolve(file.getPath());
                        ossClient.removeFile(objectKey);
                    } catch (Exception e) {
                        log.error("Failed to delete file from OSS: fileId={}, path={}", file.getId(), file.getPath(), e);
                    }
                }
            }
        }

        // If it's a folder, purge all children recursively (include trashed ones)
        if (file.getType() == FileType.FOLDER) {
            List<KnowledgeFile> children = fileService.lambdaQuery()
                    .eq(KnowledgeFile::getParentId, fileId)
                    .list();
            for (KnowledgeFile child : children) {
                purge(child.getId());
            }
        }

        // Delete from database (logic delete via @TableLogic)
        fileService.removeById(fileId);
    }

    /**
     * 清空回收站(永久删除所有已回收项)
     */
    @Transactional(rollbackFor = Exception.class)
    public void emptyTrash() {
        List<KnowledgeFile> trashed = fileService.listTrash();
        for (KnowledgeFile file : trashed) {
            try {
                purge(file.getId());
            } catch (Exception e) {
                log.error("Failed to purge file: {}", file.getId(), e);
            }
        }
    }

    /**
     * Download file from a URL and save to a specified folder.
     * The payload is streamed to a temporary file (never buffered as one big
     * byte[]), validated against the SSRF rules and the size limit, uploaded to
     * OSS and then recorded in the file center.
     *
     * @param fileUrl       the URL of the file to download
     * @param fileName      the name for the saved file (if null, derived from
     *                      Content-Disposition / the URL / the content type)
     * @param parentId      the parent folder ID (null for root)
     * @param repositoryKey the repository key (null for default)
     * @return the created file VO
     */
    @Transactional(rollbackFor = Exception.class)
    public KnowledgeFileVO downloadFromUrl(String fileUrl, String fileName, Long parentId, String repositoryKey) {
        return downloadFromUrl(fileUrl, fileName, parentId, repositoryKey, null);
    }

    /**
     * Download file from a URL with an explicit HEAD pre-check override.
     *
     * @param checkFirst whether to send a HEAD request first; null uses the
     *                   configured default
     */
    @SneakyThrows
    @Transactional(rollbackFor = Exception.class)
    public KnowledgeFileVO downloadFromUrl(String fileUrl, String fileName, Long parentId, String repositoryKey,
            Boolean checkFirst) {
        if (remoteFileDownloadService == null) {
            throw new IllegalStateException("Remote file downloader is not configured");
        }
        if (ossClient == null) {
            throw new IllegalStateException("OSS client is not configured");
        }
        try (DownloadedFile downloaded = remoteFileDownloadService.download(fileUrl, fileName, checkFirst)) {
            return saveDownloadedFile(downloaded, parentId, repositoryKey);
        }
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
        knowledgeFile.setSize((long) fileBytes.length);
        knowledgeFile.setPath(ossFile.getName());

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
     * Persist an already-downloaded temporary file to OSS and create a file
     * record. The caller keeps ownership of {@code downloaded} and must close it.
     */
    @Transactional(rollbackFor = Exception.class)
    public KnowledgeFileVO saveDownloadedFile(DownloadedFile downloaded, Long parentId, String repositoryKey) {
        if (downloaded == null || downloaded.getSize() <= 0) {
            throw new IllegalArgumentException("File bytes cannot be empty");
        }
        if (ossClient == null) {
            throw new IllegalStateException("OSS client is not configured");
        }

        String fileName = downloaded.getFileName();
        String ossFileName = cn.hutool.core.lang.UUID.fastUUID().toString() + "_" + fileName;
        MultipartFile part = new FileBackedMultipartFile("file", fileName, downloaded.getContentType(),
                downloaded.getFile());
        String bucketName = ossProperties != null ? ossProperties.getBucketName() : "knowledgex";
        com.knowledge.core.oss.model.KnowledgeFile ossFile = ossClient.putFile(bucketName, ossFileName, part);

        KnowledgeFile knowledgeFile = new KnowledgeFile();
        knowledgeFile.setType(FileType.FILE);
        knowledgeFile.setName(fileName);
        knowledgeFile.setParentId(parentId != null ? parentId : 0L);
        knowledgeFile.setSize(downloaded.getSize());
        knowledgeFile.setPath(ossFile.getName());

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
        return searchFiles(keyword, repositoryKey, null);
    }

    /**
     * Search files by keyword, optionally scoped to a folder subtree.
     *
     * @param folderId when non-null/non-zero, only files inside this folder
     *                 (its direct children and all descendants) are returned
     */
    public List<KnowledgeFileVO> searchFiles(String keyword, String repositoryKey, Long folderId) {
        if (StrUtil.isBlank(keyword)) {
            return new ArrayList<>();
        }

        boolean scopedToFolder = folderId != null && folderId != 0L;
        List<KnowledgeFile> files = fileService.lambdaQuery()
                .like(KnowledgeFile::getName, keyword)
                .eq(KnowledgeFile::getTrashed, 0)
                .eq(StrUtil.isNotBlank(repositoryKey), KnowledgeFile::getRepositoryKey, repositoryKey)
                // ancestors stores the folder chain as "0,12,34"; FIND_IN_SET matches an
                // exact token, so folder 1 never matches folder 12.
                .and(scopedToFolder, wrapper -> wrapper
                        .eq(KnowledgeFile::getParentId, folderId)
                        .or()
                        .apply("FIND_IN_SET({0}, ancestors)", folderId))
                .list();

        return files.stream()
                .map(KnowledgeFileConverter.INSTANCE::convertVO)
                .collect(Collectors.toList());
    }


    /**
     * Read-only {@link MultipartFile} view over the temporary file produced by
     * {@link RemoteFileDownloadService}. Passing the known size and content type
     * through lets the OSS client store the object without buffering all of it
     * in memory a second time.
     */
    private static final class FileBackedMultipartFile implements MultipartFile {
        private final String name;
        private final String originalFilename;
        private final String contentType;
        private final File file;

        private FileBackedMultipartFile(String name, String originalFilename, String contentType, File file) {
            this.name = name;
            this.originalFilename = originalFilename;
            this.contentType = contentType;
            this.file = file;
        }

        @Override
        public String getName() {
            return name;
        }

        @Override
        public String getOriginalFilename() {
            return originalFilename;
        }

        @Override
        public String getContentType() {
            return contentType;
        }

        @Override
        public boolean isEmpty() {
            return file == null || file.length() == 0L;
        }

        @Override
        public long getSize() {
            return file == null ? 0L : file.length();
        }

        @Override
        public byte[] getBytes() throws IOException {
            return Files.readAllBytes(file.toPath());
        }

        @Override
        public InputStream getInputStream() throws IOException {
            return new FileInputStream(file);
        }

        @Override
        public void transferTo(File dest) throws IOException, IllegalStateException {
            Files.copy(file.toPath(), dest.toPath());
        }
    }
}
