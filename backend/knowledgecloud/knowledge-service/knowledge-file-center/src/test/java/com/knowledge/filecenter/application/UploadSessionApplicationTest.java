package com.knowledge.filecenter.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Answers.RETURNS_SELF;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.knowledge.core.oss.multipart.MultipartObjectStat;
import com.knowledge.core.oss.multipart.MultipartUploadCapabilities;
import com.knowledge.core.oss.multipart.MultipartUploadClient;
import com.knowledge.core.oss.multipart.MultipartUploadSession;
import com.knowledge.core.oss.multipart.MultipartUploadedPart;
import com.knowledge.core.oss.props.OssProperties;
import com.knowledge.core.oss.rule.OssRule;
import com.knowledge.filecenter.entity.KnowledgeFile;
import com.knowledge.filecenter.entity.KnowledgeUploadPart;
import com.knowledge.filecenter.entity.KnowledgeUploadSession;
import com.knowledge.filecenter.entity.dto.upload.AbortUploadSessionRequest;
import com.knowledge.filecenter.entity.dto.upload.CreateUploadSessionRequest;
import com.knowledge.filecenter.entity.enums.UploadPartStatus;
import com.knowledge.filecenter.entity.enums.UploadSessionStatus;
import com.knowledge.filecenter.service.IFileService;
import com.knowledge.filecenter.service.IUploadPartService;
import com.knowledge.filecenter.service.IUploadSessionService;
import com.knowledge.filecenter.upload.UploadDestination;
import com.knowledge.filecenter.upload.UploadDestinationValidator;
import com.knowledge.filecenter.upload.UploadOwner;
import com.knowledge.filecenter.upload.UploadOwnerProvider;
import com.knowledge.filecenter.upload.UploadSessionPersistence;
import com.knowledge.filecenter.upload.UploadSessionProperties;

class UploadSessionApplicationTest {

    private MultipartUploadClient multipartClient;
    private IUploadSessionService sessionService;
    private IUploadPartService partService;
    private IFileService fileService;
    private UploadSessionPersistence persistence;
    private UploadOwnerProvider ownerProvider;
    private UploadDestinationValidator destinationValidator;
    private UploadSessionProperties properties;
    private UploadSessionApplication application;
    private AtomicReference<KnowledgeUploadSession> storedSession;
    private AtomicReference<List<KnowledgeUploadPart>> storedParts;

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        multipartClient = mock(MultipartUploadClient.class);
        OssProperties ossProperties = new OssProperties();
        ossProperties.setBucketName("knowledge");
        OssRule ossRule = mock(OssRule.class);
        sessionService = mock(IUploadSessionService.class);
        partService = mock(IUploadPartService.class);
        fileService = mock(IFileService.class);
        persistence = mock(UploadSessionPersistence.class);
        ownerProvider = mock(UploadOwnerProvider.class);
        destinationValidator = mock(UploadDestinationValidator.class);
        properties = new UploadSessionProperties();
        application = new UploadSessionApplication(multipartClient, ossProperties, ossRule, sessionService,
                partService, fileService, persistence, ownerProvider, destinationValidator, properties);

        storedSession = new AtomicReference<>();
        storedParts = new AtomicReference<>(Collections.emptyList());
        LambdaQueryChainWrapper<KnowledgeUploadSession> sessionQuery = mock(LambdaQueryChainWrapper.class, RETURNS_SELF);
        when(sessionService.lambdaQuery()).thenReturn(sessionQuery);
        doAnswer(invocation -> storedSession.get()).when(sessionQuery).one();
        LambdaQueryChainWrapper<KnowledgeUploadPart> partQuery = mock(LambdaQueryChainWrapper.class, RETURNS_SELF);
        when(partService.lambdaQuery()).thenReturn(partQuery);
        when(partQuery.list()).thenAnswer(invocation -> storedParts.get());
        LambdaQueryChainWrapper<KnowledgeFile> fileQuery = mock(LambdaQueryChainWrapper.class, RETURNS_SELF);
        when(fileService.lambdaQuery()).thenReturn(fileQuery);
        doAnswer(invocation -> null).when(fileQuery).one();

        when(ownerProvider.currentOwner()).thenReturn(new UploadOwner("tenant-a", 7L));
        when(destinationValidator.validate(any(UploadOwner.class), any(), any()))
                .thenReturn(new UploadDestination("repo-a", 0L));
        when(ossRule.bucketName("knowledge")).thenReturn("knowledge");
        when(ossRule.fileName(anyString())).thenReturn("upload/20260903/object.bin");
        when(multipartClient.capabilities()).thenReturn(capabilities());
    }

    @Test
    void acceptsExactTenGiBAndRejectsOneByteMore() {
        assertEquals(UploadSessionApplication.DEFAULT_PART_SIZE_BYTES,
                UploadSessionApplication.calculatePartSize(UploadSessionApplication.MAX_FILE_SIZE_BYTES, capabilities()));
        assertThrows(IllegalArgumentException.class, () -> UploadSessionApplication.calculatePartSize(
                UploadSessionApplication.MAX_FILE_SIZE_BYTES + 1, capabilities()));
    }

    @Test
    void rejectsUnverifiableWholeFileChecksumDeclaration() {
        CreateUploadSessionRequest request = request(10L);
        request.setChecksumAlgorithm("SHA-256");
        request.setChecksum("client-claimed");

        assertThrows(IllegalArgumentException.class, () -> application.create(request));

        verify(persistence, never()).create(any(), anyList());
    }

    @Test
    void rejectsNewSessionWhenOwnerQuotaIsReached() {
        CreateUploadSessionRequest request = request(10L);
        @SuppressWarnings("unchecked")
        LambdaQueryChainWrapper<KnowledgeUploadSession> query = sessionService.lambdaQuery();
        when(query.count()).thenReturn((long) properties.getMaxActiveSessionsPerOwner());

        assertThrows(IllegalStateException.class, () -> application.create(request));

        verify(multipartClient, never()).initiate(anyString(), anyString(), anyString());
    }

    @Test
    void createsExpectedPartMathAndIsIdempotentByClientUuid() {
        CreateUploadSessionRequest request = request(UploadSessionApplication.DEFAULT_PART_SIZE_BYTES + 1);
        when(persistence.create(any(KnowledgeUploadSession.class), anyList())).thenAnswer(invocation -> {
            KnowledgeUploadSession session = invocation.getArgument(0);
            session.setId(101L);
            storedSession.set(session);
            storedParts.set(invocation.getArgument(1));
            return session;
        });
        when(persistence.claimProviderInitialization(any(KnowledgeUploadSession.class), any(LocalDateTime.class)))
                .thenReturn(true);
        when(multipartClient.initiate("knowledge", "upload/20260903/object.bin", "application/octet-stream"))
                .thenReturn(MultipartUploadSession.builder().provider("minio").bucket("knowledge")
                        .objectKey("upload/20260903/object.bin").uploadId("provider-upload").build());
        when(persistence.attachProviderUpload(any(KnowledgeUploadSession.class), eq("provider-upload"),
                any(LocalDateTime.class))).thenAnswer(invocation -> {
                    KnowledgeUploadSession session = invocation.getArgument(0);
                    session.setProviderUploadId("provider-upload");
                    session.setStatus(UploadSessionStatus.UPLOADING);
                    return session;
                });

        application.create(request);
        application.create(request);

        ArgumentCaptor<List<KnowledgeUploadPart>> partsCaptor = ArgumentCaptor.forClass(List.class);
        verify(persistence).create(any(KnowledgeUploadSession.class), partsCaptor.capture());
        List<KnowledgeUploadPart> parts = partsCaptor.getValue();
        assertEquals(2, parts.size());
        assertEquals(Long.valueOf(UploadSessionApplication.DEFAULT_PART_SIZE_BYTES), parts.get(0).getPartSize());
        assertEquals(Long.valueOf(1L), parts.get(1).getPartSize());
        assertEquals(Long.valueOf(UploadSessionApplication.DEFAULT_PART_SIZE_BYTES), parts.get(1).getByteOffset());
        verify(multipartClient, times(1)).initiate(anyString(), anyString(), anyString());
    }

    @Test
    void completionVerifiesExactSizeAndFinalizesOnlyOnce() {
        KnowledgeUploadSession session = activeSession(201L, 10L);
        storedSession.set(session);
        KnowledgeUploadPart part = completedPart(201L, 1, 10L, "etag-1");
        storedParts.set(Collections.singletonList(part));
        List<MultipartUploadedPart> providerParts = Collections.singletonList(MultipartUploadedPart.builder()
                .partNumber(1).sizeBytes(10L).etag("etag-1").build());
        when(multipartClient.listParts("knowledge", "object-key", "upload-id")).thenReturn(providerParts);
        when(persistence.applyProviderParts(eq(session), eq(providerParts), any(LocalDateTime.class)))
                .thenReturn(Collections.singletonList(part));
        when(persistence.markCompleting(eq(session), any(LocalDateTime.class))).thenAnswer(invocation -> {
            session.setStatus(UploadSessionStatus.COMPLETING);
            return true;
        });
        MultipartObjectStat exact = MultipartObjectStat.builder().bucket("knowledge").objectKey("object-key")
                .sizeBytes(10L).lastModified(Instant.now()).build();
        when(multipartClient.complete(eq("knowledge"), eq("object-key"), eq("upload-id"), anyList()))
                .thenReturn(exact);
        when(multipartClient.stat("knowledge", "object-key")).thenReturn(exact);
        when(destinationValidator.validate(any(UploadOwner.class), eq("repo-a"), eq(0L)))
                .thenReturn(new UploadDestination("repo-a", 0L));
        when(persistence.finalizeCompletion(eq(session), any(LocalDateTime.class))).thenAnswer(invocation -> {
            session.setStatus(UploadSessionStatus.COMPLETED);
            session.setCompletedFileId(301L);
            return null;
        });

        application.complete(201L, null);
        application.complete(201L, null);

        verify(multipartClient, times(1)).complete(eq("knowledge"), eq("object-key"), eq("upload-id"), anyList());
        verify(multipartClient, never()).stat("knowledge", "object-key");
        verify(persistence, times(1)).finalizeCompletion(eq(session), any(LocalDateTime.class));
    }

    @Test
    void completionRejectsWrongFinalObjectSizeWithoutCreatingFile() {
        KnowledgeUploadSession session = activeSession(202L, 10L);
        storedSession.set(session);
        KnowledgeUploadPart part = completedPart(202L, 1, 10L, "etag-1");
        storedParts.set(Collections.singletonList(part));
        List<MultipartUploadedPart> providerParts = Collections.singletonList(MultipartUploadedPart.builder()
                .partNumber(1).sizeBytes(10L).etag("etag-1").build());
        when(multipartClient.listParts(anyString(), anyString(), anyString())).thenReturn(providerParts);
        when(persistence.applyProviderParts(eq(session), eq(providerParts), any(LocalDateTime.class)))
                .thenReturn(Collections.singletonList(part));
        when(persistence.markCompleting(eq(session), any(LocalDateTime.class))).thenReturn(true);
        when(multipartClient.stat("knowledge", "object-key")).thenReturn(MultipartObjectStat.builder()
                .bucket("knowledge").objectKey("object-key").sizeBytes(9L).build());

        assertThrows(IllegalStateException.class, () -> application.complete(202L, null));

        verify(persistence).markFailed(eq(session), eq("VERIFY"), eq("FINAL_SIZE_MISMATCH"), anyString(),
                eq(false), any(LocalDateTime.class));
        verify(persistence, never()).finalizeCompletion(any(), any(LocalDateTime.class));
    }

    @Test
    void completionRequiresProviderPartsToSumToExactExpectedSize() {
        KnowledgeUploadSession session = activeSession(205L, 10L);
        storedSession.set(session);
        KnowledgeUploadPart shortPart = completedPart(205L, 1, 9L, "etag-1");
        List<MultipartUploadedPart> providerParts = Collections.singletonList(MultipartUploadedPart.builder()
                .partNumber(1).sizeBytes(9L).etag("etag-1").build());
        when(persistence.markCompleting(eq(session), any(LocalDateTime.class))).thenReturn(true);
        when(multipartClient.listParts(anyString(), anyString(), anyString())).thenReturn(providerParts);
        when(persistence.applyProviderParts(eq(session), eq(providerParts), any(LocalDateTime.class)))
                .thenReturn(Collections.singletonList(shortPart));

        assertThrows(IllegalStateException.class, () -> application.complete(205L, null));

        verify(multipartClient, never()).complete(anyString(), anyString(), anyString(), anyList());
        verify(persistence).markFailed(eq(session), eq("COMPLETE"), eq("PARTS_INCOMPLETE"), anyString(),
                eq(true), any(LocalDateTime.class));
    }

    @Test
    void retryingFailedCompletionStatsObjectBeforeListingParts() {
        KnowledgeUploadSession session = activeSession(204L, 10L);
        session.setStatus(UploadSessionStatus.FAILED);
        session.setFailureStage("COMPLETE");
        storedSession.set(session);
        MultipartObjectStat exact = MultipartObjectStat.builder().bucket("knowledge").objectKey("object-key")
                .sizeBytes(10L).build();
        when(multipartClient.stat("knowledge", "object-key")).thenReturn(exact);
        when(destinationValidator.validate(any(UploadOwner.class), eq("repo-a"), eq(0L)))
                .thenReturn(new UploadDestination("repo-a", 0L));
        when(persistence.finalizeCompletion(eq(session), any(LocalDateTime.class))).thenAnswer(invocation -> {
            session.setStatus(UploadSessionStatus.COMPLETED);
            session.setCompletedFileId(304L);
            return null;
        });

        application.complete(204L, null);

        verify(multipartClient, never()).listParts(anyString(), anyString(), anyString());
        verify(persistence).finalizeCompletion(eq(session), any(LocalDateTime.class));
    }

    @Test
    void abortIsIdempotentAtProvider() {
        KnowledgeUploadSession session = activeSession(203L, 10L);
        storedSession.set(session);
        when(persistence.markAborting(eq(session), any(LocalDateTime.class))).thenAnswer(invocation -> {
            if (session.getStatus() == UploadSessionStatus.ABORTED) {
                return false;
            }
            session.setStatus(UploadSessionStatus.ABORTING);
            return true;
        });
        doAnswer(invocation -> {
            session.setStatus(UploadSessionStatus.ABORTED);
            return null;
        }).when(persistence).markAborted(eq(session), any(), any(LocalDateTime.class));

        application.abort(203L, new AbortUploadSessionRequest());
        application.abort(203L, new AbortUploadSessionRequest());

        verify(multipartClient, times(1)).abort("knowledge", "object-key", "upload-id");
    }

    @Test
    void abortRetriesProviderCallForPreviouslyClaimedAbortingSession() {
        KnowledgeUploadSession session = activeSession(206L, 10L);
        session.setStatus(UploadSessionStatus.ABORTING);
        storedSession.set(session);
        doAnswer(invocation -> {
            session.setStatus(UploadSessionStatus.ABORTED);
            return null;
        }).when(persistence).markAborted(eq(session), any(), any(LocalDateTime.class));

        application.abort(206L, null);

        verify(persistence, never()).markAborting(any(KnowledgeUploadSession.class), any(LocalDateTime.class));
        verify(multipartClient).abort("knowledge", "object-key", "upload-id");
    }

    private CreateUploadSessionRequest request(long size) {
        CreateUploadSessionRequest request = new CreateUploadSessionRequest();
        request.setClientUuid("123e4567-e89b-42d3-a456-426614174000");
        request.setRepositoryKey("repo-a");
        request.setParentId(0L);
        request.setOriginalName("object.bin");
        request.setContentType("application/octet-stream");
        request.setExpectedSize(size);
        return request;
    }

    private KnowledgeUploadSession activeSession(Long id, long size) {
        KnowledgeUploadSession session = new KnowledgeUploadSession();
        session.setId(id);
        session.setTenantId("tenant-a");
        session.setUserId(7L);
        session.setClientUuid("123e4567-e89b-42d3-a456-426614174000");
        session.setRepositoryKey("repo-a");
        session.setParentId(0L);
        session.setOriginalName("object.bin");
        session.setContentType("application/octet-stream");
        session.setExpectedSize(size);
        session.setProvider("minio");
        session.setBucket("knowledge");
        session.setObjectKey("object-key");
        session.setProviderUploadId("upload-id");
        session.setPartSize(size);
        session.setPartCount(1);
        session.setConfirmedBytes(size);
        session.setStatus(UploadSessionStatus.UPLOADING);
        session.setRetryable(true);
        session.setRetryCount(0);
        session.setLastActivityTime(LocalDateTime.now());
        session.setExpiresAt(LocalDateTime.now().plusHours(1));
        session.setMaxExpiresAt(LocalDateTime.now().plusDays(1));
        return session;
    }

    private KnowledgeUploadPart completedPart(Long sessionId, int partNumber, long size, String etag) {
        KnowledgeUploadPart part = new KnowledgeUploadPart();
        part.setTenantId("tenant-a");
        part.setUserId(7L);
        part.setUploadSessionId(sessionId);
        part.setPartNumber(partNumber);
        part.setByteOffset(0L);
        part.setPartSize(size);
        part.setStatus(UploadPartStatus.COMPLETED);
        part.setEtag(etag);
        part.setAttemptCount(1);
        return part;
    }

    private MultipartUploadCapabilities capabilities() {
        return MultipartUploadCapabilities.builder()
                .provider("minio")
                .minPartSizeBytes(5L * 1024 * 1024)
                .maxPartSizeBytes(5L * 1024 * 1024 * 1024)
                .maxPartCount(10_000)
                .maxParallelParts(4)
                .maxTargetExpirySeconds(3600)
                .build();
    }
}
