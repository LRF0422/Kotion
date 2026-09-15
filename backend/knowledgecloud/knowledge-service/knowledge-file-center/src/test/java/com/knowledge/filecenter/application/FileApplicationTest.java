package com.knowledge.filecenter.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Answers.RETURNS_SELF;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.multipart.MultipartFile;

import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.knowledge.core.oss.OssClient;
import com.knowledge.core.oss.props.OssProperties;
import com.knowledge.file.api.entity.enums.FileType;
import com.knowledge.filecenter.entity.KnowledgeFile;
import com.knowledge.filecenter.entity.vo.FileAccessUrlsVO;
import com.knowledge.filecenter.entity.vo.FileContentVO;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;
import com.knowledge.filecenter.service.IFileRepositoryService;
import com.knowledge.filecenter.service.IFileService;
import com.knowledge.filecenter.storage.LegacyOssObjectKeyResolver;
import com.knowledge.filecenter.upload.UploadOwner;
import com.knowledge.filecenter.upload.UploadOwnerProvider;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

@ExtendWith(MockitoExtension.class)
class FileApplicationTest {

    @Mock
    private IFileService fileService;
    @Mock
    private IFileRepositoryService repositoryService;
    @Mock
    private OssClient ossClient;
    @Mock
    private OssProperties ossProperties;
    @Mock
    private LegacyOssObjectKeyResolver ossObjectKeyResolver;
    @Mock
    private UploadOwnerProvider ownerProvider;
    @InjectMocks
    private FileApplication application;

    @BeforeEach
    void preserveApplicationFileKeyOnInsert() {
        lenient().when(fileService.createOrSaveFile(any(KnowledgeFile.class))).thenAnswer(invocation -> {
            KnowledgeFile file = invocation.getArgument(0);
            file.setFileKey("application-record-key");
            return file;
        });
    }

    @Test
    void uploadPersistsObjectKeyInPath() {
        MockMultipartFile multipart = new MockMultipartFile("file", "meeting.webm", "audio/webm", new byte[] { 1, 2 });
        com.knowledge.core.oss.model.KnowledgeFile ossFile = ossFile(
                "upload/20260902/meeting.webm",
                "http://192.168.3.43:9000/knowledge/upload/20260902/meeting.webm");
        when(ossClient.putFile(multipart)).thenReturn(ossFile);

        KnowledgeFileVO result = application.uploadFile(multipart, 9L, "repo");

        assertEquals("upload/20260902/meeting.webm", result.getPath());
        assertEquals(Long.valueOf(2L), result.getSize());
        assertEquals("application-record-key", result.getFileKey());
    }

    @Test
    void uploadPreservesFileSizeBeyondIntegerRange() {
        MultipartFile multipart = mock(MultipartFile.class);
        when(multipart.isEmpty()).thenReturn(false);
        when(multipart.getSize()).thenReturn(3_000_000_000L);
        when(multipart.getOriginalFilename()).thenReturn("large.bin");
        com.knowledge.core.oss.model.KnowledgeFile ossFile = ossFile("upload/large.bin", null);
        when(ossClient.putFile(multipart)).thenReturn(ossFile);

        KnowledgeFileVO result = application.uploadFile(multipart, 9L, "repo");

        assertEquals(Long.valueOf(3_000_000_000L), result.getSize());
    }

    @Test
    void saveDownloadedFilePersistsObjectKeyInPath() {
        com.knowledge.core.oss.model.KnowledgeFile ossFile = ossFile(
                "downloaded/object.pdf",
                "http://192.168.3.43:9000/knowledge/downloaded/object.pdf");
        when(ossProperties.getBucketName()).thenReturn("knowledge");
        when(ossClient.putFile(anyString(), anyString(), any(InputStream.class))).thenReturn(ossFile);

        KnowledgeFileVO result = application.saveDownloadedFile(new byte[] { 1, 2, 3 }, "object.pdf", 0L, "repo");

        assertEquals("downloaded/object.pdf", result.getPath());
        assertEquals("application-record-key", result.getFileKey());
    }

    @Test
    void folderMetadataLookupDoesNotTouchRecentAccess() {
        KnowledgeFile folder = new KnowledgeFile();
        folder.setId(1L);
        folder.setType(FileType.FOLDER);
        folder.setName("Design");
        when(fileService.getById(1L)).thenReturn(folder);

        application.getById(1L);

        verify(fileService, never()).touchAccess(1L);
    }

    @Test
    void fileMetadataLookupStillTouchesRecentAccess() {
        KnowledgeFile file = file(1L, "upload/object.webm", "application-record-key");
        when(fileService.getById(1L)).thenReturn(file);
        when(fileService.touchAccess(1L)).thenReturn(file);

        KnowledgeFileVO result = application.getById(1L);

        verify(fileService).touchAccess(1L);
        assertEquals("meeting.webm", result.getName());
    }

    @Test
    void downloadUsesResolvedPathInsteadOfFileKey() {
        KnowledgeFile file = file(1L, "legacy-url", "application-record-key");
        when(fileService.getById(1L)).thenReturn(file);
        when(ossObjectKeyResolver.resolve("legacy-url")).thenReturn("upload/object.webm");
        when(ossClient.downloadFile("upload/object.webm")).thenReturn(new ByteArrayInputStream(new byte[] { 1, 2 }));
        MockHttpServletResponse response = new MockHttpServletResponse();

        application.downloadFile(1L, response);

        verify(ossClient).downloadFile("upload/object.webm");
        verify(ossClient, never()).downloadFile("application-record-key");
        assertEquals(2, response.getContentAsByteArray().length);
    }

    @Test
    void createsSignedPreviewAndDownloadUrlsFromResolvedPath() {
        KnowledgeFile file = file(1L, "legacy-url", "application-record-key");
        when(fileService.getById(1L)).thenReturn(file);
        when(ownerProvider.currentOwner()).thenReturn(new UploadOwner("tenant-a", 7L));
        when(ossProperties.getBucketName()).thenReturn("knowledge");
        when(ossObjectKeyResolver.resolve("legacy-url")).thenReturn("upload/object.webm");

        try (S3Presigner presigner = presigner()) {
            ReflectionTestUtils.setField(application, "s3Presigner", presigner);

            FileAccessUrlsVO result = application.createAccessUrls(1L);

            URI preview = URI.create(result.getPreviewUrl());
            URI download = URI.create(result.getDownloadUrl());
            assertEquals("/knowledge/upload/object.webm", preview.getPath());
            assertTrue(preview.getRawQuery().contains("X-Amz-Expires=3600"));
            assertTrue(preview.getRawQuery().contains("response-content-disposition=inline"));
            assertTrue(download.getRawQuery().contains("response-content-disposition=attachment"));
            assertTrue(result.getExpiresAt().isAfter(Instant.now().plusSeconds(3500)));
            verify(fileService).touchAccess(1L);
        }
    }

    @Test
    void rejectsAccessUrlForAnotherTenant() {
        KnowledgeFile file = file(1L, "upload/object.webm", "application-record-key");
        file.setTenantId("tenant-b");
        when(fileService.getById(1L)).thenReturn(file);
        when(ownerProvider.currentOwner()).thenReturn(new UploadOwner("tenant-a", 7L));

        assertThrows(IllegalArgumentException.class, () -> application.createAccessUrls(1L));
    }

    @Test
    void rejectsAccessUrlForFolder() {
        KnowledgeFile folder = file(1L, "folder", "application-record-key");
        folder.setType(FileType.FOLDER);
        when(fileService.getById(1L)).thenReturn(folder);
        when(ownerProvider.currentOwner()).thenReturn(new UploadOwner("tenant-a", 7L));

        assertThrows(IllegalArgumentException.class, () -> application.createAccessUrls(1L));
    }

    @Test
    void rejectsAccessUrlWhenPresignerIsUnavailable() {
        KnowledgeFile file = file(1L, "upload/object.webm", "application-record-key");
        when(fileService.getById(1L)).thenReturn(file);
        when(ownerProvider.currentOwner()).thenReturn(new UploadOwner("tenant-a", 7L));
        ReflectionTestUtils.setField(application, "s3Presigner", null);

        assertThrows(IllegalStateException.class, () -> application.createAccessUrls(1L));
    }

    @Test
    void purgeDeletesUnsharedObjectByResolvedPath() {
        KnowledgeFile file = file(1L, "legacy-url", "application-record-key");
        when(fileService.getById(1L)).thenReturn(file);
        LambdaQueryChainWrapper<KnowledgeFile> query = mock(LambdaQueryChainWrapper.class, RETURNS_SELF);
        when(fileService.lambdaQuery()).thenReturn(query);
        when(query.count()).thenReturn(0L);
        when(ossObjectKeyResolver.resolve("legacy-url")).thenReturn("upload/object.webm");

        application.purge(1L);

        verify(ossClient).removeFile("upload/object.webm");
        verify(ossClient, never()).removeFile("application-record-key");
    }

    @Test
    void purgeKeepsSharedObject() {
        KnowledgeFile file = file(1L, "upload/shared.webm", "application-record-key");
        when(fileService.getById(1L)).thenReturn(file);
        LambdaQueryChainWrapper<KnowledgeFile> query = mock(LambdaQueryChainWrapper.class, RETURNS_SELF);
        when(fileService.lambdaQuery()).thenReturn(query);
        when(query.count()).thenReturn(1L);

        application.purge(1L);

        verify(ossClient, never()).removeFile(anyString());
    }

    @Test
    void readFileContentReturnsUtf8Text() {
        KnowledgeFile file = file(1L, "upload/notes.md", "record-key");
        file.setName("notes.md");
        file.setSuffix("md");
        when(fileService.getById(1L)).thenReturn(file);
        when(ownerProvider.currentOwner()).thenReturn(new UploadOwner("tenant-a", 7L));
        when(ossObjectKeyResolver.resolve("upload/notes.md")).thenReturn("upload/notes.md");
        when(ossClient.downloadFile("upload/notes.md")).thenReturn(streamOf("hello 世界"));

        FileContentVO result = application.readFileContent(1L, null);

        assertTrue(result.isText());
        assertEquals("hello 世界", result.getContent());
        assertEquals("utf-8", result.getEncoding());
        assertFalse(result.isTruncated());
        verify(fileService).touchAccess(1L);
    }

    @Test
    void readFileContentTruncatesToRequestedLength() {
        KnowledgeFile file = file(1L, "upload/notes.txt", "record-key");
        file.setName("notes.txt");
        file.setSuffix("txt");
        when(fileService.getById(1L)).thenReturn(file);
        when(ownerProvider.currentOwner()).thenReturn(new UploadOwner("tenant-a", 7L));
        when(ossObjectKeyResolver.resolve("upload/notes.txt")).thenReturn("upload/notes.txt");
        when(ossClient.downloadFile("upload/notes.txt")).thenReturn(streamOf("0123456789"));

        FileContentVO result = application.readFileContent(1L, 4);

        assertTrue(result.isText());
        assertTrue(result.isTruncated());
        assertEquals("0123", result.getContent());
    }

    @Test
    void readFileContentStripsUtf8Bom() {
        KnowledgeFile file = file(1L, "upload/bom.txt", "record-key");
        file.setName("bom.txt");
        file.setSuffix("txt");
        when(fileService.getById(1L)).thenReturn(file);
        when(ownerProvider.currentOwner()).thenReturn(new UploadOwner("tenant-a", 7L));
        when(ossObjectKeyResolver.resolve("upload/bom.txt")).thenReturn("upload/bom.txt");
        when(ossClient.downloadFile("upload/bom.txt")).thenReturn(
                new ByteArrayInputStream(new byte[] { (byte) 0xEF, (byte) 0xBB, (byte) 0xBF, 'h', 'i' }));

        FileContentVO result = application.readFileContent(1L, null);

        assertEquals("hi", result.getContent());
    }

    @Test
    void readFileContentRejectsBinaryFile() {
        KnowledgeFile file = file(1L, "upload/logo.png", "record-key");
        file.setName("logo.png");
        file.setSuffix("png");
        when(fileService.getById(1L)).thenReturn(file);
        when(ownerProvider.currentOwner()).thenReturn(new UploadOwner("tenant-a", 7L));
        when(ossObjectKeyResolver.resolve("upload/logo.png")).thenReturn("upload/logo.png");
        when(ossClient.downloadFile("upload/logo.png")).thenReturn(
                new ByteArrayInputStream(new byte[] { 0, 1, 2, 3 }));

        FileContentVO result = application.readFileContent(1L, null);

        assertFalse(result.isText());
        assertNull(result.getContent());
        assertTrue(result.getMessage().contains("binary"));
        verify(fileService, never()).touchAccess(1L);
    }

    @Test
    void readFileContentSniffsUnknownSuffixAsText() {
        KnowledgeFile file = file(1L, "upload/CHANGELOG", "record-key");
        file.setName("CHANGELOG");
        file.setSuffix(null);
        when(fileService.getById(1L)).thenReturn(file);
        when(ownerProvider.currentOwner()).thenReturn(new UploadOwner("tenant-a", 7L));
        when(ossObjectKeyResolver.resolve("upload/CHANGELOG")).thenReturn("upload/CHANGELOG");
        when(ossClient.downloadFile("upload/CHANGELOG")).thenReturn(streamOf("release notes"));

        FileContentVO result = application.readFileContent(1L, null);

        assertTrue(result.isText());
        assertEquals("release notes", result.getContent());
    }

    @Test
    void readFileContentUsesResolvedObjectKey() {
        KnowledgeFile file = file(1L, "legacy-url", "record-key");
        file.setName("notes.md");
        file.setSuffix("md");
        when(fileService.getById(1L)).thenReturn(file);
        when(ownerProvider.currentOwner()).thenReturn(new UploadOwner("tenant-a", 7L));
        when(ossObjectKeyResolver.resolve("legacy-url")).thenReturn("upload/notes.md");
        when(ossClient.downloadFile("upload/notes.md")).thenReturn(streamOf("body"));

        application.readFileContent(1L, null);

        verify(ossClient).downloadFile("upload/notes.md");
        verify(ossClient, never()).downloadFile("record-key");
    }

    @Test
    void readFileContentRejectsAnotherTenant() {
        KnowledgeFile file = file(1L, "upload/notes.md", "record-key");
        file.setTenantId("tenant-b");
        when(fileService.getById(1L)).thenReturn(file);
        when(ownerProvider.currentOwner()).thenReturn(new UploadOwner("tenant-a", 7L));

        assertThrows(IllegalArgumentException.class, () -> application.readFileContent(1L, null));
    }

    @Test
    void readFileContentRejectsFolder() {
        KnowledgeFile folder = file(1L, "folder", "record-key");
        folder.setType(FileType.FOLDER);
        when(fileService.getById(1L)).thenReturn(folder);

        assertThrows(IllegalArgumentException.class, () -> application.readFileContent(1L, null));
    }

    private static InputStream streamOf(String content) {
        return new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8));
    }

    private static com.knowledge.core.oss.model.KnowledgeFile ossFile(String name, String link) {
        com.knowledge.core.oss.model.KnowledgeFile file = new com.knowledge.core.oss.model.KnowledgeFile();
        file.setName(name);
        file.setLink(link);
        return file;
    }

    private static S3Presigner presigner() {
        return S3Presigner.builder()
                .endpointOverride(URI.create("https://objects.example.com"))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create("access-key", "secret-key")))
                .region(Region.US_EAST_1)
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build();
    }

    private static KnowledgeFile file(Long id, String path, String fileKey) {
        KnowledgeFile file = new KnowledgeFile();
        file.setId(id);
        file.setType(FileType.FILE);
        file.setName("meeting.webm");
        file.setPath(path);
        file.setFileKey(fileKey);
        file.setTenantId("tenant-a");
        return file;
    }
}
