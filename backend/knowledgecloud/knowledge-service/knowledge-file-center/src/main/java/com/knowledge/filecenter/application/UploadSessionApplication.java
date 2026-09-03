package com.knowledge.filecenter.application;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import com.knowledge.core.oss.multipart.MultipartObjectStat;
import com.knowledge.core.oss.multipart.MultipartUploadCapabilities;
import com.knowledge.core.oss.multipart.MultipartUploadClient;
import com.knowledge.core.oss.multipart.MultipartUploadSession;
import com.knowledge.core.oss.multipart.MultipartUploadTarget;
import com.knowledge.core.oss.multipart.MultipartUploadedPart;
import com.knowledge.core.oss.props.OssProperties;
import com.knowledge.core.oss.rule.OssRule;
import com.knowledge.filecenter.converter.KnowledgeFileConverter;
import com.knowledge.filecenter.entity.KnowledgeFile;
import com.knowledge.filecenter.entity.KnowledgeUploadPart;
import com.knowledge.filecenter.entity.KnowledgeUploadSession;
import com.knowledge.filecenter.entity.dto.upload.AbortUploadSessionRequest;
import com.knowledge.filecenter.entity.dto.upload.CompleteUploadSessionRequest;
import com.knowledge.filecenter.entity.dto.upload.CreateUploadSessionRequest;
import com.knowledge.filecenter.entity.dto.upload.SignUploadPartsRequest;
import com.knowledge.filecenter.entity.dto.upload.UploadPartAcknowledgementRequest;
import com.knowledge.filecenter.entity.enums.UploadPartStatus;
import com.knowledge.filecenter.entity.enums.UploadSessionStatus;
import com.knowledge.filecenter.entity.vo.upload.SignedUploadPartVO;
import com.knowledge.filecenter.entity.vo.upload.UploadCapabilitiesVO;
import com.knowledge.filecenter.entity.vo.upload.UploadPartVO;
import com.knowledge.filecenter.entity.vo.upload.UploadSessionVO;
import com.knowledge.filecenter.service.IFileService;
import com.knowledge.filecenter.service.IUploadPartService;
import com.knowledge.filecenter.service.IUploadSessionService;
import com.knowledge.filecenter.upload.UploadDestination;
import com.knowledge.filecenter.upload.UploadDestinationValidator;
import com.knowledge.filecenter.upload.UploadOwner;
import com.knowledge.filecenter.upload.UploadOwnerProvider;
import com.knowledge.filecenter.upload.UploadSessionPersistence;
import com.knowledge.filecenter.upload.UploadSessionProperties;

import cn.hutool.core.util.StrUtil;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class UploadSessionApplication {

    public static final long MAX_FILE_SIZE_BYTES = 10L * 1024 * 1024 * 1024;
    public static final long DEFAULT_PART_SIZE_BYTES = 16L * 1024 * 1024;

    private static final Set<UploadSessionStatus> ACTIVE_STATUSES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            UploadSessionStatus.CREATED,
            UploadSessionStatus.UPLOADING,
            UploadSessionStatus.COMPLETING,
            UploadSessionStatus.FAILED,
            UploadSessionStatus.ABORTING)));

    private final MultipartUploadClient multipartClient;
    private final OssProperties ossProperties;
    private final OssRule ossRule;
    private final IUploadSessionService sessionService;
    private final IUploadPartService partService;
    private final IFileService fileService;
    private final UploadSessionPersistence persistence;
    private final UploadOwnerProvider ownerProvider;
    private final UploadDestinationValidator destinationValidator;
    private final UploadSessionProperties properties;

    public UploadCapabilitiesVO capabilities() {
        MultipartUploadCapabilities capabilities = validatedCapabilities();
        return UploadCapabilitiesVO.builder()
                .provider(capabilities.getProvider())
                .maxFileSizeBytes(MAX_FILE_SIZE_BYTES)
                .defaultPartSizeBytes(DEFAULT_PART_SIZE_BYTES)
                .minPartSizeBytes(capabilities.getMinPartSizeBytes())
                .maxPartSizeBytes(capabilities.getMaxPartSizeBytes())
                .maxPartCount(capabilities.getMaxPartCount())
                .maxParallelParts(capabilities.getMaxParallelParts())
                .targetExpirySeconds(effectiveTargetExpiry(capabilities).getSeconds() > Integer.MAX_VALUE
                        ? Integer.MAX_VALUE : (int) effectiveTargetExpiry(capabilities).getSeconds())
                .build();
    }

    public UploadSessionVO create(CreateUploadSessionRequest request) {
        UploadOwner owner = ownerProvider.currentOwner();
        validateCreateRequest(request);
        MultipartUploadCapabilities capabilities = validatedCapabilities();
        UploadDestination destination = destinationValidator.validate(owner, request.getRepositoryKey(), request.getParentId());
        String originalName = safeOriginalName(request.getOriginalName());

        KnowledgeUploadSession existing = findByClientUuid(owner, request.getClientUuid());
        if (existing != null) {
            validateIdempotentCreate(existing, request, destination, originalName);
            return initializeProviderIfNecessary(existing);
        }
        long activeSessions = sessionService.lambdaQuery()
                .eq(KnowledgeUploadSession::getTenantId, owner.getTenantId())
                .eq(KnowledgeUploadSession::getUserId, owner.getUserId())
                .in(KnowledgeUploadSession::getStatus, ACTIVE_STATUSES)
                .count();
        if (activeSessions >= properties.getMaxActiveSessionsPerOwner()) {
            throw new IllegalStateException("Active upload session quota exceeded");
        }

        long partSize = calculatePartSize(request.getExpectedSize(), capabilities);
        int partCount = partCount(request.getExpectedSize(), partSize);
        LocalDateTime now = LocalDateTime.now();
        KnowledgeUploadSession session = new KnowledgeUploadSession();
        session.setTenantId(owner.getTenantId());
        session.setUserId(owner.getUserId());
        session.setClientUuid(request.getClientUuid().toLowerCase());
        session.setRepositoryKey(destination.getRepositoryKey());
        session.setParentId(destination.getParentId());
        session.setOriginalName(originalName);
        session.setContentType(trimToNull(request.getContentType()));
        session.setExpectedSize(request.getExpectedSize());
        session.setProvider(capabilities.getProvider());
        session.setBucket(serverBucket());
        session.setObjectKey(serverObjectKey(originalName));
        session.setPartSize(partSize);
        session.setPartCount(partCount);
        session.setConfirmedBytes(0L);
        session.setStatus(UploadSessionStatus.CREATED);
        session.setRetryable(true);
        session.setRetryCount(0);
        session.setChecksumAlgorithm(trimToNull(request.getChecksumAlgorithm()));
        session.setChecksum(trimToNull(request.getChecksum()));
        session.setVersion(0L);
        session.setLastActivityTime(now);
        session.setExpiresAt(now.plus(properties.getInactivityTimeout()));
        session.setMaxExpiresAt(now.plus(properties.getMaxLifetime()));
        if (session.getExpiresAt().isAfter(session.getMaxExpiresAt())) {
            session.setExpiresAt(session.getMaxExpiresAt());
        }

        try {
            persistence.create(session, buildParts(session, owner));
        } catch (DataIntegrityViolationException duplicate) {
            KnowledgeUploadSession concurrent = findByClientUuid(owner, request.getClientUuid());
            if (concurrent == null) {
                throw duplicate;
            }
            validateIdempotentCreate(concurrent, request, destination, originalName);
            return initializeProviderIfNecessary(concurrent);
        }
        return initializeProviderIfNecessary(session);
    }

    public List<SignedUploadPartVO> signParts(Long sessionId, SignUploadPartsRequest request) {
        KnowledgeUploadSession session = requireOwned(sessionId);
        ensureUploadUsable(session);
        MultipartUploadCapabilities capabilities = validatedCapabilities();
        if (request == null || request.getPartNumbers() == null || request.getPartNumbers().isEmpty()) {
            throw new IllegalArgumentException("At least one part number is required");
        }
        List<Integer> partNumbers = request.getPartNumbers();
        Set<Integer> unique = new HashSet<>(partNumbers);
        if (unique.size() != partNumbers.size()) {
            throw new IllegalArgumentException("Part numbers must be unique");
        }
        for (Integer partNumber : partNumbers) {
            if (partNumber == null || partNumber < 1 || partNumber > session.getPartCount()) {
                throw new IllegalArgumentException("Invalid upload part number");
            }
        }
        if (partNumbers.size() > capabilities.getMaxParallelParts()) {
            throw new IllegalArgumentException("Too many parts requested for one signing operation");
        }
        List<KnowledgeUploadPart> parts = partService.lambdaQuery()
                .eq(KnowledgeUploadPart::getTenantId, session.getTenantId())
                .eq(KnowledgeUploadPart::getUserId, session.getUserId())
                .eq(KnowledgeUploadPart::getUploadSessionId, session.getId())
                .in(KnowledgeUploadPart::getPartNumber, partNumbers)
                .list();
        if (parts.size() != partNumbers.size()) {
            throw new IllegalArgumentException("One or more upload parts do not exist");
        }
        parts.sort((left, right) -> Integer.compare(left.getPartNumber(), right.getPartNumber()));
        Duration expiry = effectiveTargetExpiry(capabilities);
        List<SignedUploadPartVO> targets = new ArrayList<>();
        for (KnowledgeUploadPart part : parts) {
            if (part.getStatus() == UploadPartStatus.COMPLETED) {
                throw new IllegalStateException("Completed upload parts cannot be signed again");
            }
            MultipartUploadTarget target = multipartClient.createPartUploadTarget(
                    session.getBucket(), session.getObjectKey(), session.getProviderUploadId(),
                    part.getPartNumber(), part.getPartSize(), expiry);
            targets.add(SignedUploadPartVO.builder()
                    .partNumber(part.getPartNumber())
                    .byteOffset(part.getByteOffset())
                    .sizeBytes(part.getPartSize())
                    .method(target.getMethod())
                    .url(target.getUrl())
                    .headers(target.getHeaders())
                    .expiresAt(target.getExpiresAt())
                    .etagResponseHeader(target.getEtagResponseHeader())
                    .checksumResponseHeader(target.getChecksumResponseHeader())
                    .build());
        }
        persistence.markPartsSigned(session, partNumbers, LocalDateTime.now());
        return targets;
    }

    public UploadPartVO acknowledgePart(Long sessionId, int partNumber, UploadPartAcknowledgementRequest request) {
        KnowledgeUploadSession session = requireOwned(sessionId);
        ensureUploadUsable(session);
        if (partNumber < 1 || partNumber > session.getPartCount()) {
            throw new IllegalArgumentException("Invalid upload part number");
        }
        if (request == null || request.getSizeBytes() == null || StrUtil.isBlank(request.getEtag())) {
            throw new IllegalArgumentException("Part size and ETag are required");
        }
        return toPartVO(persistence.acknowledge(session, partNumber, request, LocalDateTime.now()));
    }

    public UploadSessionVO reconcile(Long sessionId) {
        KnowledgeUploadSession session = requireOwned(sessionId);
        if (session.getStatus() == UploadSessionStatus.COMPLETED) {
            return toVO(session);
        }
        ensureUploadUsable(session);
        reconcileProvider(session);
        return toVO(requireOwned(sessionId));
    }

    public UploadSessionVO complete(Long sessionId, CompleteUploadSessionRequest request) {
        KnowledgeUploadSession session = requireOwned(sessionId);
        if (session.getStatus() == UploadSessionStatus.COMPLETED) {
            return toVO(session);
        }
        ensureUploadUsable(session);
        if (request != null && (StrUtil.isNotBlank(request.getChecksumAlgorithm())
                || StrUtil.isNotBlank(request.getChecksum()))) {
            throw new IllegalArgumentException("Whole-file checksum verification is not supported");
        }

        boolean reclaimedCompleting = false;
        if (session.getStatus() == UploadSessionStatus.COMPLETING
                || (session.getStatus() == UploadSessionStatus.FAILED
                        && "COMPLETE".equals(session.getFailureStage()))) {
            MultipartObjectStat existingObject = tryStat(session);
            if (existingObject != null) {
                verifyExactFinalSize(session, existingObject);
                finalizeVerified(session);
                return toVO(requireOwned(sessionId));
            }
            if (session.getStatus() == UploadSessionStatus.COMPLETING) {
                reclaimedCompleting = persistence.reclaimCompleting(session, LocalDateTime.now());
                if (!reclaimedCompleting) {
                    throw new IllegalStateException("Upload session completion is already in progress");
                }
                session = requireOwned(sessionId);
            }
        }

        if (!reclaimedCompleting && !persistence.markCompleting(session, LocalDateTime.now())) {
            MultipartObjectStat completingObject = tryStat(session);
            if (completingObject == null) {
                throw new IllegalStateException("Upload session completion is already in progress");
            }
            verifyExactFinalSize(session, completingObject);
            finalizeVerified(session);
            return toVO(requireOwned(sessionId));
        }
        session = requireOwned(sessionId);
        List<KnowledgeUploadPart> parts = reconcileProvider(session);
        List<KnowledgeUploadPart> completedParts = parts.stream()
                .filter(part -> part.getStatus() == UploadPartStatus.COMPLETED)
                .collect(Collectors.toList());
        long providerConfirmedBytes = completedParts.stream()
                .mapToLong(KnowledgeUploadPart::getPartSize)
                .sum();
        if (parts.size() != session.getPartCount()
                || completedParts.size() != session.getPartCount()
                || providerConfirmedBytes != session.getExpectedSize()) {
            persistence.markFailed(session, "COMPLETE", "PARTS_INCOMPLETE",
                    "Storage provider parts do not exactly match the requested file", true, LocalDateTime.now());
            throw new IllegalStateException("Upload parts do not exactly match the requested file");
        }
        List<MultipartUploadedPart> completionParts = completedParts.stream()
                .map(part -> MultipartUploadedPart.builder()
                        .partNumber(part.getPartNumber())
                        .sizeBytes(part.getPartSize())
                        .etag(part.getEtag())
                        .checksum(part.getProviderChecksum())
                        .build())
                .collect(Collectors.toList());
        try {
            validateDestination(session);
        } catch (RuntimeException destinationFailure) {
            persistence.markFailed(session, "DESTINATION", "UPLOAD_DESTINATION_INVALID",
                    "Upload destination is no longer available", false, LocalDateTime.now());
            throw destinationFailure;
        }
        MultipartObjectStat completedObject;
        try {
            completedObject = multipartClient.complete(session.getBucket(), session.getObjectKey(),
                    session.getProviderUploadId(), completionParts);
            if (completedObject == null) {
                completedObject = multipartClient.stat(session.getBucket(), session.getObjectKey());
            }
        } catch (RuntimeException providerFailure) {
            MultipartObjectStat recoveredObject = tryStat(session);
            if (recoveredObject == null) {
                persistence.markFailed(session, "COMPLETE", "PROVIDER_COMPLETION_FAILED",
                        "Storage provider completion failed", true, LocalDateTime.now());
                throw new IllegalStateException("Storage provider completion failed", providerFailure);
            }
            completedObject = recoveredObject;
        }
        verifyExactFinalSize(session, completedObject);
        finalizeVerified(session);
        return toVO(requireOwned(sessionId));
    }

    public UploadSessionVO abort(Long sessionId, AbortUploadSessionRequest request) {
        KnowledgeUploadSession session = requireOwned(sessionId);
        String reason = request == null ? null : trimToNull(request.getReason());
        boolean retryingAborting = session.getStatus() == UploadSessionStatus.ABORTING;
        if (!retryingAborting && !persistence.markAborting(session, LocalDateTime.now())) {
            return toVO(requireOwned(sessionId));
        }
        session = requireOwned(sessionId);
        requireProviderMatch(session);
        try {
            if (StrUtil.isNotBlank(session.getProviderUploadId())) {
                multipartClient.abort(session.getBucket(), session.getObjectKey(), session.getProviderUploadId());
            }
        } catch (RuntimeException providerFailure) {
            persistence.markFailed(session, "ABORT", "PROVIDER_ABORT_FAILED",
                    "Storage provider abort failed", true, LocalDateTime.now());
            throw new IllegalStateException("Storage provider abort failed", providerFailure);
        }
        persistence.markAborted(session, reason, LocalDateTime.now());
        return toVO(requireOwned(sessionId));
    }

    public UploadSessionVO get(Long sessionId) {
        return toVO(requireOwned(sessionId));
    }

    public List<UploadSessionVO> active() {
        UploadOwner owner = ownerProvider.currentOwner();
        return sessionService.lambdaQuery()
                .eq(KnowledgeUploadSession::getTenantId, owner.getTenantId())
                .eq(KnowledgeUploadSession::getUserId, owner.getUserId())
                .in(KnowledgeUploadSession::getStatus, ACTIVE_STATUSES)
                .orderByDesc(KnowledgeUploadSession::getLastActivityTime)
                .last("limit 100")
                .list()
                .stream()
                .map(this::toVO)
                .collect(Collectors.toList());
    }

    public void expireForCleanup(KnowledgeUploadSession session) {
        if (session == null || !ACTIVE_STATUSES.contains(session.getStatus())) return;
        if (session.getStatus() == UploadSessionStatus.COMPLETING) {
            MultipartObjectStat completedObject = tryStat(session);
            if (completedObject != null) {
                verifyExactFinalSize(session, completedObject);
                finalizeVerified(session);
            } else {
                persistence.markFailed(session, "COMPLETE", "STALE_COMPLETION",
                        "Upload completion must be retried", true, LocalDateTime.now());
            }
            return;
        }
        if (!persistence.markAbortingIfExpired(session, LocalDateTime.now())) {
            return;
        }
        requireProviderMatch(session);
        try {
            if (StrUtil.isNotBlank(session.getProviderUploadId())) {
                multipartClient.abort(session.getBucket(), session.getObjectKey(), session.getProviderUploadId());
            }
            persistence.markExpired(session, LocalDateTime.now());
        } catch (RuntimeException providerFailure) {
            persistence.markFailed(session, "CLEANUP", "PROVIDER_ABORT_FAILED",
                    "Storage provider cleanup failed", true, LocalDateTime.now());
        }
    }

    public void reconcileForCleanup(KnowledgeUploadSession session) {
        if (session == null || session.getStatus() != UploadSessionStatus.UPLOADING
                || StrUtil.isBlank(session.getProviderUploadId())) {
            return;
        }
        try {
            requireProviderMatch(session);
            reconcileProvider(session);
        } catch (RuntimeException ignored) {
            // The provider path records a retryable failure; state races are left untouched.
        }
    }

    public static long calculatePartSize(long expectedSize, MultipartUploadCapabilities capabilities) {
        if (expectedSize <= 0 || expectedSize > MAX_FILE_SIZE_BYTES) {
            throw new IllegalArgumentException("File size must be between 1 byte and 10 GiB");
        }
        validateCapabilities(capabilities);
        long minimumForPartCount = ceilDiv(expectedSize, capabilities.getMaxPartCount());
        long partSize = Math.max(DEFAULT_PART_SIZE_BYTES,
                Math.max(capabilities.getMinPartSizeBytes(), minimumForPartCount));
        if (partSize > capabilities.getMaxPartSizeBytes()) {
            throw new IllegalArgumentException("Storage provider cannot support the requested file size");
        }
        if (ceilDiv(expectedSize, partSize) > capabilities.getMaxPartCount()) {
            throw new IllegalArgumentException("Storage provider part-count limit would be exceeded");
        }
        return partSize;
    }

    private UploadSessionVO initializeProviderIfNecessary(KnowledgeUploadSession session) {
        if (StrUtil.isNotBlank(session.getProviderUploadId())) {
            return toVO(session);
        }
        if (!persistence.claimProviderInitialization(session, LocalDateTime.now())) {
            KnowledgeUploadSession current = requireOwned(session.getId());
            if (StrUtil.isNotBlank(current.getProviderUploadId())) {
                return toVO(current);
            }
            if (current.getStatus() == UploadSessionStatus.UPLOADING
                    || (current.getStatus() == UploadSessionStatus.CREATED
                            && "INITIATING".equals(current.getFailureStage()))) {
                return toVO(current);
            }
            throw new IllegalStateException("Upload session provider initialization is not retryable");
        }
        session = requireOwned(session.getId());
        MultipartUploadSession providerSession = null;
        KnowledgeUploadSession initialized;
        try {
            requireProviderMatch(session);
            providerSession = multipartClient.initiate(
                    session.getBucket(), session.getObjectKey(), session.getContentType());
            if (providerSession == null || StrUtil.isBlank(providerSession.getUploadId())
                    || !Objects.equals(session.getProvider(), providerSession.getProvider())
                    || !Objects.equals(session.getBucket(), providerSession.getBucket())
                    || !Objects.equals(session.getObjectKey(), providerSession.getObjectKey())) {
                throw new IllegalStateException("Storage provider returned an invalid upload session");
            }
            initialized = persistence.attachProviderUpload(
                    session, providerSession.getUploadId(), LocalDateTime.now());
        } catch (RuntimeException providerFailure) {
            if (providerSession != null && StrUtil.isNotBlank(providerSession.getUploadId())) {
                try {
                    multipartClient.abort(session.getBucket(), session.getObjectKey(), providerSession.getUploadId());
                } catch (RuntimeException cleanupFailure) {
                    // Provider lifecycle cleanup remains the final safety net for an unpersisted upload ID.
                }
            }
            persistence.markFailed(session, "INITIATE", "PROVIDER_INITIATION_FAILED",
                    "Storage provider initialization failed", true, LocalDateTime.now());
            throw new IllegalStateException("Storage provider initialization failed", providerFailure);
        }
        return toVO(initialized);
    }

    private List<KnowledgeUploadPart> reconcileProvider(KnowledgeUploadSession session) {
        List<MultipartUploadedPart> providerParts;
        try {
            providerParts = multipartClient.listParts(
                    session.getBucket(), session.getObjectKey(), session.getProviderUploadId());
        } catch (RuntimeException providerFailure) {
            persistence.markFailed(session, "RECONCILE", "PROVIDER_RECONCILE_FAILED",
                    "Storage provider reconciliation failed", true, LocalDateTime.now());
            throw new IllegalStateException("Storage provider reconciliation failed", providerFailure);
        }
        return persistence.applyProviderParts(session,
                providerParts == null ? Collections.emptyList() : providerParts, LocalDateTime.now());
    }

    private MultipartObjectStat tryStat(KnowledgeUploadSession session) {
        try {
            return multipartClient.stat(session.getBucket(), session.getObjectKey());
        } catch (RuntimeException notCompletedOrUnavailable) {
            return null;
        }
    }

    private KnowledgeFile finalizeVerified(KnowledgeUploadSession session) {
        validateDestination(session);
        return persistence.finalizeCompletion(session, LocalDateTime.now());
    }

    private void validateDestination(KnowledgeUploadSession session) {
        UploadDestination destination = destinationValidator.validate(
                new UploadOwner(session.getTenantId(), session.getUserId()),
                session.getRepositoryKey(), session.getParentId());
        if (!Objects.equals(destination.getRepositoryKey(), session.getRepositoryKey())
                || !Objects.equals(destination.getParentId(), session.getParentId())) {
            throw new IllegalStateException("Upload destination changed before completion");
        }
    }

    private void verifyExactFinalSize(KnowledgeUploadSession session, MultipartObjectStat stat) {
        if (stat == null || stat.getSizeBytes() != session.getExpectedSize()) {
            persistence.markFailed(session, "VERIFY", "FINAL_SIZE_MISMATCH",
                    "Completed object size does not match the requested file size", false, LocalDateTime.now());
            throw new IllegalStateException("Completed object size does not match the requested file size");
        }
    }

    private KnowledgeUploadSession requireOwned(Long sessionId) {
        UploadOwner owner = ownerProvider.currentOwner();
        KnowledgeUploadSession session = sessionService.lambdaQuery()
                .eq(KnowledgeUploadSession::getId, sessionId)
                .eq(KnowledgeUploadSession::getTenantId, owner.getTenantId())
                .eq(KnowledgeUploadSession::getUserId, owner.getUserId())
                .one();
        if (session == null) {
            throw new IllegalArgumentException("Upload session not found");
        }
        return session;
    }

    private KnowledgeUploadSession findByClientUuid(UploadOwner owner, String clientUuid) {
        return sessionService.lambdaQuery()
                .eq(KnowledgeUploadSession::getTenantId, owner.getTenantId())
                .eq(KnowledgeUploadSession::getUserId, owner.getUserId())
                .eq(KnowledgeUploadSession::getClientUuid, clientUuid.toLowerCase())
                .one();
    }

    private void ensureUploadUsable(KnowledgeUploadSession session) {
        if (session.getStatus() == UploadSessionStatus.COMPLETED) {
            throw new IllegalStateException("Upload session is already complete");
        }
        if (session.getStatus() == UploadSessionStatus.ABORTED
                || session.getStatus() == UploadSessionStatus.ABORTING
                || session.getStatus() == UploadSessionStatus.EXPIRED
                || (session.getStatus() == UploadSessionStatus.FAILED
                        && (!Boolean.TRUE.equals(session.getRetryable())
                                || "ABORT".equals(session.getFailureStage())
                                || "CLEANUP".equals(session.getFailureStage())))) {
            throw new IllegalStateException("Upload session is not active");
        }
        LocalDateTime now = LocalDateTime.now();
        if (now.isAfter(session.getExpiresAt()) || now.isAfter(session.getMaxExpiresAt())) {
            expireForCleanup(session);
            throw new IllegalStateException("Upload session has expired");
        }
        if (StrUtil.isBlank(session.getProviderUploadId())) {
            throw new IllegalStateException("Upload session is not initialized with the storage provider");
        }
        requireProviderMatch(session);
    }

    private void requireProviderMatch(KnowledgeUploadSession session) {
        String activeProvider = validatedCapabilities().getProvider();
        if (!Objects.equals(activeProvider, session.getProvider())) {
            throw new IllegalStateException("Upload session storage provider is not active");
        }
    }

    private void validateCreateRequest(CreateUploadSessionRequest request) {
        if (request == null || StrUtil.isBlank(request.getClientUuid()) || StrUtil.isBlank(request.getOriginalName())
                || request.getExpectedSize() == null) {
            throw new IllegalArgumentException("Client UUID, original name, and expected size are required");
        }
        if (request.getExpectedSize() <= 0 || request.getExpectedSize() > MAX_FILE_SIZE_BYTES) {
            throw new IllegalArgumentException("File size must be between 1 byte and 10 GiB");
        }
        if (request.getClientUuid().length() > 64 || request.getOriginalName().length() > 512) {
            throw new IllegalArgumentException("Upload request field exceeds its maximum length");
        }
        if (StrUtil.isNotBlank(request.getChecksumAlgorithm()) || StrUtil.isNotBlank(request.getChecksum())) {
            throw new IllegalArgumentException("Whole-file checksum verification is not supported");
        }
    }

    private void validateIdempotentCreate(KnowledgeUploadSession existing, CreateUploadSessionRequest request,
            UploadDestination destination, String originalName) {
        if (!Objects.equals(existing.getExpectedSize(), request.getExpectedSize())
                || !Objects.equals(existing.getOriginalName(), originalName)
                || !Objects.equals(existing.getRepositoryKey(), destination.getRepositoryKey())
                || !Objects.equals(existing.getParentId(), destination.getParentId())
                || !Objects.equals(existing.getContentType(), trimToNull(request.getContentType()))
                || !Objects.equals(existing.getChecksumAlgorithm(), trimToNull(request.getChecksumAlgorithm()))
                || !Objects.equals(existing.getChecksum(), trimToNull(request.getChecksum()))) {
            throw new IllegalStateException("Client UUID is already used by a different upload request");
        }
    }

    private List<KnowledgeUploadPart> buildParts(KnowledgeUploadSession session, UploadOwner owner) {
        List<KnowledgeUploadPart> parts = new ArrayList<>(session.getPartCount());
        for (int partNumber = 1; partNumber <= session.getPartCount(); partNumber++) {
            long offset = (partNumber - 1L) * session.getPartSize();
            long size = Math.min(session.getPartSize(), session.getExpectedSize() - offset);
            KnowledgeUploadPart part = new KnowledgeUploadPart();
            part.setTenantId(owner.getTenantId());
            part.setUserId(owner.getUserId());
            part.setUploadSessionId(session.getId());
            part.setPartNumber(partNumber);
            part.setByteOffset(offset);
            part.setPartSize(size);
            part.setStatus(UploadPartStatus.PENDING);
            part.setAttemptCount(0);
            parts.add(part);
        }
        return parts;
    }

    private int partCount(long expectedSize, long partSize) {
        return (int) ceilDiv(expectedSize, partSize);
    }

    private MultipartUploadCapabilities validatedCapabilities() {
        MultipartUploadCapabilities capabilities = multipartClient.capabilities();
        validateCapabilities(capabilities);
        return capabilities;
    }

    private static void validateCapabilities(MultipartUploadCapabilities capabilities) {
        if (capabilities == null || StrUtil.isBlank(capabilities.getProvider())
                || capabilities.getMinPartSizeBytes() <= 0
                || capabilities.getMaxPartSizeBytes() < capabilities.getMinPartSizeBytes()
                || capabilities.getMaxPartCount() <= 0
                || capabilities.getMaxParallelParts() <= 0
                || capabilities.getMaxTargetExpirySeconds() <= 0) {
            throw new IllegalStateException("Storage provider multipart capabilities are invalid");
        }
    }

    private Duration effectiveTargetExpiry(MultipartUploadCapabilities capabilities) {
        Duration configured = properties.getTargetExpiry();
        if (configured == null || configured.isZero() || configured.isNegative() || configured.getSeconds() <= 0) {
            throw new IllegalStateException("Upload target expiry must be positive");
        }
        return configured.getSeconds() <= capabilities.getMaxTargetExpirySeconds()
                ? configured : Duration.ofSeconds(capabilities.getMaxTargetExpirySeconds());
    }

    private String serverBucket() {
        String bucket = ossRule.bucketName(ossProperties.getBucketName());
        if (StrUtil.isBlank(bucket) || bucket.length() > 128) {
            throw new IllegalStateException("Configured upload bucket is invalid");
        }
        return bucket;
    }

    private String serverObjectKey(String originalName) {
        String objectKey = ossRule.fileName(originalName);
        if (StrUtil.isBlank(objectKey) || objectKey.length() > 1024) {
            throw new IllegalStateException("Generated upload object key is invalid");
        }
        return objectKey;
    }

    private String safeOriginalName(String originalName) {
        String safe = originalName.replace('\\', '/');
        safe = safe.substring(safe.lastIndexOf('/') + 1).trim();
        if (StrUtil.isBlank(safe) || safe.indexOf('\0') >= 0 || safe.length() > 512) {
            throw new IllegalArgumentException("Original file name is invalid");
        }
        return safe;
    }

    private UploadSessionVO toVO(KnowledgeUploadSession session) {
        List<UploadPartVO> parts = partService.lambdaQuery()
                .eq(KnowledgeUploadPart::getTenantId, session.getTenantId())
                .eq(KnowledgeUploadPart::getUserId, session.getUserId())
                .eq(KnowledgeUploadPart::getUploadSessionId, session.getId())
                .orderByAsc(KnowledgeUploadPart::getPartNumber)
                .list()
                .stream()
                .map(this::toPartVO)
                .collect(Collectors.toList());
        KnowledgeFile completedFile = session.getCompletedFileId() == null ? null : fileService.lambdaQuery()
                .eq(KnowledgeFile::getTenantId, session.getTenantId())
                .eq(KnowledgeFile::getId, session.getCompletedFileId())
                .one();
        return UploadSessionVO.builder()
                .id(session.getId())
                .clientUuid(session.getClientUuid())
                .repositoryKey(session.getRepositoryKey())
                .parentId(session.getParentId())
                .originalName(session.getOriginalName())
                .contentType(session.getContentType())
                .expectedSize(session.getExpectedSize())
                .partSize(session.getPartSize())
                .partCount(session.getPartCount())
                .confirmedBytes(session.getConfirmedBytes())
                .status(session.getStatus())
                .failureStage(session.getFailureStage())
                .failureCode(session.getFailureCode())
                .failureMessage(session.getFailureMessage())
                .retryable(Boolean.TRUE.equals(session.getRetryable()))
                .retryCount(session.getRetryCount() == null ? 0 : session.getRetryCount())
                .completedFileId(session.getCompletedFileId())
                .completedFile(completedFile == null ? null : KnowledgeFileConverter.INSTANCE.convertVO(completedFile))
                .checksumAlgorithm(session.getChecksumAlgorithm())
                .checksum(session.getChecksum())
                .lastActivityTime(session.getLastActivityTime())
                .expiresAt(session.getExpiresAt())
                .maxExpiresAt(session.getMaxExpiresAt())
                .parts(parts)
                .build();
    }

    private UploadPartVO toPartVO(KnowledgeUploadPart part) {
        return UploadPartVO.builder()
                .partNumber(part.getPartNumber())
                .byteOffset(part.getByteOffset())
                .sizeBytes(part.getPartSize())
                .status(part.getStatus())
                .etag(part.getEtag())
                .providerChecksum(part.getProviderChecksum())
                .checksumAlgorithm(part.getChecksumAlgorithm())
                .checksum(part.getChecksum())
                .attemptCount(part.getAttemptCount() == null ? 0 : part.getAttemptCount())
                .uploadedAt(part.getUploadedAt())
                .build();
    }

    private static long ceilDiv(long dividend, long divisor) {
        return dividend / divisor + (dividend % divisor == 0 ? 0 : 1);
    }

    private String trimToNull(String value) {
        return StrUtil.isBlank(value) ? null : value.trim();
    }
}
