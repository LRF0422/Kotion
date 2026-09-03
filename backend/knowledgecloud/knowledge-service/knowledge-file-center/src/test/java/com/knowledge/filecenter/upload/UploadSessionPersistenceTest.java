package com.knowledge.filecenter.upload;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Answers.RETURNS_SELF;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.knowledge.filecenter.entity.KnowledgeFile;
import com.knowledge.filecenter.entity.KnowledgeUploadPart;
import com.knowledge.filecenter.entity.KnowledgeUploadSession;
import com.knowledge.filecenter.entity.dto.upload.UploadPartAcknowledgementRequest;
import com.knowledge.filecenter.entity.enums.UploadPartStatus;
import com.knowledge.filecenter.entity.enums.UploadSessionStatus;
import com.knowledge.filecenter.mapper.UploadPartMapper;
import com.knowledge.filecenter.mapper.UploadSessionMapper;
import com.knowledge.filecenter.service.IFileService;
import com.knowledge.filecenter.service.IUploadPartService;
import com.knowledge.filecenter.service.IUploadSessionService;

class UploadSessionPersistenceTest {

    private IUploadSessionService sessionService;
    private IUploadPartService partService;
    private IFileService fileService;
    private UploadSessionMapper sessionMapper;
    private UploadPartMapper partMapper;
    private UploadSessionPersistence persistence;
    private KnowledgeUploadSession session;

    @BeforeEach
    void setUp() {
        sessionService = mock(IUploadSessionService.class);
        partService = mock(IUploadPartService.class);
        fileService = mock(IFileService.class);
        sessionMapper = mock(UploadSessionMapper.class);
        partMapper = mock(UploadPartMapper.class);
        persistence = new UploadSessionPersistence(sessionService, partService, fileService,
                sessionMapper, partMapper, new UploadSessionProperties());
        session = session();
        when(sessionMapper.selectOwnedForUpdate(11L, "tenant-a", 7L)).thenReturn(session);
        when(sessionService.updateById(any(KnowledgeUploadSession.class))).thenReturn(true);
        when(partService.updateById(any(KnowledgeUploadPart.class))).thenReturn(true);
    }

    @Test
    void rejectsConflictingRepeatedPartAcknowledgement() {
        KnowledgeUploadPart completed = new KnowledgeUploadPart();
        completed.setUploadSessionId(11L);
        completed.setTenantId("tenant-a");
        completed.setUserId(7L);
        completed.setPartNumber(1);
        completed.setPartSize(10L);
        completed.setStatus(UploadPartStatus.COMPLETED);
        completed.setEtag("etag-a");
        when(partMapper.selectOwnedForUpdate(11L, 1, "tenant-a", 7L)).thenReturn(completed);
        UploadPartAcknowledgementRequest request = new UploadPartAcknowledgementRequest();
        request.setSizeBytes(10L);
        request.setEtag("etag-b");

        assertThrows(IllegalStateException.class,
                () -> persistence.acknowledge(session, 1, request, LocalDateTime.now()));

        verify(partService, times(0)).updateById(any(KnowledgeUploadPart.class));
    }

    @SuppressWarnings("unchecked")
    @Test
    void finalizationCreatesOnlyOneFileRecordForSession() {
        AtomicReference<KnowledgeFile> storedFile = new AtomicReference<>();
        LambdaQueryChainWrapper<KnowledgeFile> fileQuery = mock(LambdaQueryChainWrapper.class, RETURNS_SELF);
        when(fileService.lambdaQuery()).thenReturn(fileQuery);
        doAnswer(invocation -> storedFile.get()).when(fileQuery).one();
        when(fileService.createOrSaveFile(any(KnowledgeFile.class))).thenAnswer(invocation -> {
            KnowledgeFile file = invocation.getArgument(0);
            file.setId(99L);
            storedFile.set(file);
            return file;
        });

        KnowledgeFile first = persistence.finalizeCompletion(session, LocalDateTime.now());
        KnowledgeFile second = persistence.finalizeCompletion(session, LocalDateTime.now());

        assertSame(first, second);
        verify(fileService, times(1)).createOrSaveFile(any(KnowledgeFile.class));
    }

    private KnowledgeUploadSession session() {
        KnowledgeUploadSession value = new KnowledgeUploadSession();
        value.setId(11L);
        value.setTenantId("tenant-a");
        value.setUserId(7L);
        value.setRepositoryKey("repo-a");
        value.setParentId(0L);
        value.setOriginalName("object.bin");
        value.setExpectedSize(10L);
        value.setObjectKey("upload/object.bin");
        value.setPartCount(1);
        value.setPartSize(10L);
        value.setConfirmedBytes(10L);
        value.setStatus(UploadSessionStatus.COMPLETING);
        value.setRetryable(true);
        value.setRetryCount(0);
        value.setVersion(0L);
        value.setMaxExpiresAt(LocalDateTime.now().plusDays(1));
        value.setExpiresAt(LocalDateTime.now().plusHours(1));
        return value;
    }
}
