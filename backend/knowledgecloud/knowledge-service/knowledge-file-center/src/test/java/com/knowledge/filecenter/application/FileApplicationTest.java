package com.knowledge.filecenter.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
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

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.knowledge.core.oss.OssClient;
import com.knowledge.core.oss.props.OssProperties;
import com.knowledge.file.api.entity.enums.FileType;
import com.knowledge.filecenter.entity.KnowledgeFile;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;
import com.knowledge.filecenter.service.IFileRepositoryService;
import com.knowledge.filecenter.service.IFileService;
import com.knowledge.filecenter.storage.LegacyOssObjectKeyResolver;

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

    private static com.knowledge.core.oss.model.KnowledgeFile ossFile(String name, String link) {
        com.knowledge.core.oss.model.KnowledgeFile file = new com.knowledge.core.oss.model.KnowledgeFile();
        file.setName(name);
        file.setLink(link);
        return file;
    }

    private static KnowledgeFile file(Long id, String path, String fileKey) {
        KnowledgeFile file = new KnowledgeFile();
        file.setId(id);
        file.setType(FileType.FILE);
        file.setName("meeting.webm");
        file.setPath(path);
        file.setFileKey(fileKey);
        return file;
    }
}
