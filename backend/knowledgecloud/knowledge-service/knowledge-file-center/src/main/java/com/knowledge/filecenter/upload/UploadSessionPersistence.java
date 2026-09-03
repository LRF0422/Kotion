package com.knowledge.filecenter.upload;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.knowledge.core.oss.multipart.MultipartUploadedPart;
import com.knowledge.file.api.entity.enums.FileType;
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

import cn.hutool.core.util.StrUtil;
import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class UploadSessionPersistence {

    private final IUploadSessionService sessionService;
    private final IUploadPartService partService;
    private final IFileService fileService;
    private final UploadSessionMapper sessionMapper;
    private final UploadPartMapper partMapper;
    private final UploadSessionProperties properties;

    @Transactional(rollbackFor = Exception.class)
    public KnowledgeUploadSession create(KnowledgeUploadSession session, List<KnowledgeUploadPart> parts) {
        sessionMapper.ensureOwnerQuotaLock(session.getTenantId(), session.getUserId());
        Long lockedUserId = sessionMapper.lockOwnerForUploadQuota(session.getTenantId(), session.getUserId());
        if (!Objects.equals(lockedUserId, session.getUserId())) {
            throw new IllegalStateException("Authenticated upload owner no longer exists");
        }
        long activeSessions = sessionService.lambdaQuery()
                .eq(KnowledgeUploadSession::getTenantId, session.getTenantId())
                .eq(KnowledgeUploadSession::getUserId, session.getUserId())
                .in(KnowledgeUploadSession::getStatus,
                        UploadSessionStatus.CREATED, UploadSessionStatus.UPLOADING,
                        UploadSessionStatus.COMPLETING, UploadSessionStatus.FAILED,
                        UploadSessionStatus.ABORTING)
                .count();
        if (activeSessions >= properties.getMaxActiveSessionsPerOwner()) {
            throw new IllegalStateException("Active upload session quota exceeded");
        }
        if (!sessionService.save(session) || session.getId() == null) {
            throw new IllegalStateException("Failed to persist upload session");
        }
        for (KnowledgeUploadPart part : parts) {
            part.setUploadSessionId(session.getId());
        }
        if (!partService.saveBatch(parts)) {
            throw new IllegalStateException("Failed to persist upload parts");
        }
        return session;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean claimProviderInitialization(KnowledgeUploadSession source, LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        if (StrUtil.isNotBlank(session.getProviderUploadId())) {
            return false;
        }
        if ("INITIATING".equals(session.getFailureStage()) && !operationLeaseExpired(session, now)) {
            return false;
        }
        if (session.getStatus() != UploadSessionStatus.CREATED
                && !(session.getStatus() == UploadSessionStatus.FAILED && Boolean.TRUE.equals(session.getRetryable()))) {
            return false;
        }
        session.setStatus(UploadSessionStatus.CREATED);
        session.setFailureStage("INITIATING");
        session.setFailureCode(null);
        session.setFailureMessage(null);
        session.setRetryable(false);
        touch(session, now);
        checkedUpdate(session);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public KnowledgeUploadSession attachProviderUpload(KnowledgeUploadSession source, String providerUploadId,
            LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        if (StrUtil.isNotBlank(session.getProviderUploadId())) {
            if (!Objects.equals(session.getProviderUploadId(), providerUploadId)) {
                throw new IllegalStateException("Upload session already has a different provider upload");
            }
            return session;
        }
        if (session.getStatus() != UploadSessionStatus.CREATED
                || !"INITIATING".equals(session.getFailureStage())) {
            throw new IllegalStateException("Upload session is no longer awaiting provider initialization");
        }
        session.setProviderUploadId(providerUploadId);
        session.setStatus(UploadSessionStatus.UPLOADING);
        clearFailure(session);
        touch(session, now);
        checkedUpdate(session);
        return session;
    }

    @Transactional(rollbackFor = Exception.class)
    public void markPartsSigned(KnowledgeUploadSession source, List<Integer> partNumbers, LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        requirePartMutationAllowed(session);
        List<KnowledgeUploadPart> parts = partService.lambdaQuery()
                .eq(KnowledgeUploadPart::getTenantId, session.getTenantId())
                .eq(KnowledgeUploadPart::getUserId, session.getUserId())
                .eq(KnowledgeUploadPart::getUploadSessionId, session.getId())
                .in(KnowledgeUploadPart::getPartNumber, partNumbers)
                .list();
        if (parts.size() != partNumbers.size()) {
            throw new IllegalArgumentException("One or more upload parts do not exist");
        }
        for (KnowledgeUploadPart part : parts) {
            if (part.getStatus() != UploadPartStatus.COMPLETED) {
                part.setStatus(UploadPartStatus.UPLOADING);
                part.setAttemptCount(value(part.getAttemptCount()) + 1);
                checkedUpdate(part);
            }
        }
        if (session.getStatus() == UploadSessionStatus.CREATED || session.getStatus() == UploadSessionStatus.FAILED) {
            session.setStatus(UploadSessionStatus.UPLOADING);
            clearFailure(session);
        }
        touch(session, now);
        checkedUpdate(session);
    }

    @Transactional(rollbackFor = Exception.class)
    public KnowledgeUploadPart acknowledge(KnowledgeUploadSession source, int partNumber,
            UploadPartAcknowledgementRequest request, LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        requirePartMutationAllowed(session);
        KnowledgeUploadPart part = partMapper.selectOwnedForUpdate(
                session.getId(), partNumber, session.getTenantId(), session.getUserId());
        if (part == null) {
            throw new IllegalArgumentException("Upload part not found");
        }
        if (!Objects.equals(part.getPartSize(), request.getSizeBytes())) {
            throw new IllegalArgumentException("Acknowledged part size does not match the expected size");
        }
        if (part.getStatus() == UploadPartStatus.COMPLETED) {
            if (!sameEtag(part.getEtag(), request.getEtag())
                    || !Objects.equals(part.getProviderChecksum(), request.getProviderChecksum())
                    || !Objects.equals(part.getChecksumAlgorithm(), request.getChecksumAlgorithm())
                    || !Objects.equals(part.getChecksum(), request.getChecksum())) {
                throw new IllegalStateException("Upload part acknowledgement conflicts with the existing acknowledgement");
            }
            return part;
        }
        part.setEtag(request.getEtag());
        part.setProviderChecksum(request.getProviderChecksum());
        part.setChecksumAlgorithm(request.getChecksumAlgorithm());
        part.setChecksum(request.getChecksum());
        part.setStatus(UploadPartStatus.COMPLETED);
        part.setUploadedAt(now);
        checkedUpdate(part);
        incrementConfirmedBytes(session, part.getPartSize(), now);
        return part;
    }

    @Transactional(rollbackFor = Exception.class)
    public List<KnowledgeUploadPart> applyProviderParts(KnowledgeUploadSession source,
            List<MultipartUploadedPart> providerParts, LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        if (session.getStatus() == UploadSessionStatus.COMPLETED
                || session.getStatus() == UploadSessionStatus.ABORTING
                || session.getStatus() == UploadSessionStatus.ABORTED
                || session.getStatus() == UploadSessionStatus.EXPIRED
                || (session.getStatus() == UploadSessionStatus.FAILED && !Boolean.TRUE.equals(session.getRetryable()))) {
            throw new IllegalStateException("Upload session cannot be reconciled from status " + session.getStatus());
        }
        List<KnowledgeUploadPart> parts = partService.lambdaQuery()
                .eq(KnowledgeUploadPart::getTenantId, session.getTenantId())
                .eq(KnowledgeUploadPart::getUserId, session.getUserId())
                .eq(KnowledgeUploadPart::getUploadSessionId, session.getId())
                .orderByAsc(KnowledgeUploadPart::getPartNumber)
                .list();
        Map<Integer, MultipartUploadedPart> byNumber = new HashMap<>();
        for (MultipartUploadedPart providerPart : providerParts) {
            MultipartUploadedPart previous = byNumber.put(providerPart.getPartNumber(), providerPart);
            if (previous != null) {
                throw new IllegalStateException("Provider returned a duplicate part number");
            }
        }
        long confirmedBytes = 0L;
        for (KnowledgeUploadPart part : parts) {
            MultipartUploadedPart providerPart = byNumber.remove(part.getPartNumber());
            if (providerPart == null) {
                if (part.getStatus() == UploadPartStatus.COMPLETED) {
                    part.setStatus(UploadPartStatus.FAILED);
                    part.setEtag(null);
                    part.setProviderChecksum(null);
                    part.setUploadedAt(null);
                    checkedUpdate(part);
                }
                continue;
            }
            if (providerPart.getSizeBytes() != part.getPartSize()) {
                throw new IllegalStateException("Provider part size does not match the expected size");
            }
            if (StrUtil.isBlank(providerPart.getEtag())) {
                throw new IllegalStateException("Provider part is missing an ETag");
            }
            boolean changed = part.getStatus() != UploadPartStatus.COMPLETED
                    || !sameEtag(part.getEtag(), providerPart.getEtag())
                    || !Objects.equals(part.getProviderChecksum(), providerPart.getChecksum());
            if (changed) {
                part.setStatus(UploadPartStatus.COMPLETED);
                part.setEtag(providerPart.getEtag());
                part.setProviderChecksum(providerPart.getChecksum());
                part.setUploadedAt(now);
                checkedUpdate(part);
            }
            confirmedBytes += providerPart.getSizeBytes();
        }
        if (!byNumber.isEmpty()) {
            throw new IllegalStateException("Provider returned an unexpected part number");
        }
        session.setConfirmedBytes(confirmedBytes);
        if (session.getStatus() != UploadSessionStatus.COMPLETING) {
            session.setStatus(UploadSessionStatus.UPLOADING);
        }
        clearFailure(session);
        touch(session, now);
        checkedUpdate(session);
        return parts;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean markCompleting(KnowledgeUploadSession source, LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        if (session.getStatus() == UploadSessionStatus.COMPLETING) {
            return false;
        }
        if (session.getStatus() == UploadSessionStatus.COMPLETED) {
            return false;
        }
        if (session.getStatus() != UploadSessionStatus.UPLOADING
                && !(session.getStatus() == UploadSessionStatus.FAILED && Boolean.TRUE.equals(session.getRetryable()))) {
            throw new IllegalStateException("Upload session cannot be completed from status " + session.getStatus());
        }
        session.setStatus(UploadSessionStatus.COMPLETING);
        clearFailure(session);
        touch(session, now);
        checkedUpdate(session);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean reclaimCompleting(KnowledgeUploadSession source, LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        if (session.getStatus() != UploadSessionStatus.COMPLETING || !operationLeaseExpired(session, now)) {
            return false;
        }
        touch(session, now);
        checkedUpdate(session);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public KnowledgeFile finalizeCompletion(KnowledgeUploadSession source, LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        boolean recoverableCompletionFailure = session.getStatus() == UploadSessionStatus.FAILED
                && "COMPLETE".equals(session.getFailureStage()) && Boolean.TRUE.equals(session.getRetryable());
        if (session.getStatus() != UploadSessionStatus.COMPLETING
                && session.getStatus() != UploadSessionStatus.COMPLETED
                && !recoverableCompletionFailure) {
            throw new IllegalStateException("Upload session cannot be finalized from status " + session.getStatus());
        }
        KnowledgeFile file = fileService.lambdaQuery()
                .eq(KnowledgeFile::getTenantId, session.getTenantId())
                .eq(KnowledgeFile::getUploadSessionId, session.getId())
                .one();
        if (file == null) {
            file = new KnowledgeFile();
            file.setTenantId(session.getTenantId());
            file.setType(FileType.FILE);
            file.setName(session.getOriginalName());
            file.setPath(session.getObjectKey());
            file.setRepositoryKey(session.getRepositoryKey());
            file.setParentId(session.getParentId());
            file.setSize(session.getExpectedSize());
            file.setUploadSessionId(session.getId());
            file = fileService.createOrSaveFile(file);
            if (file == null || file.getId() == null) {
                throw new IllegalStateException("Failed to create completed file record");
            }
        }
        session.setCompletedFileId(file.getId());
        session.setConfirmedBytes(session.getExpectedSize());
        session.setStatus(UploadSessionStatus.COMPLETED);
        session.setRetryable(false);
        clearFailure(session);
        session.setRetryable(false);
        touch(session, now);
        checkedUpdate(session);
        return file;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean markAborting(KnowledgeUploadSession source, LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        if (session.getStatus() == UploadSessionStatus.ABORTED
                || session.getStatus() == UploadSessionStatus.ABORTING
                || session.getStatus() == UploadSessionStatus.EXPIRED) {
            return false;
        }
        if (session.getStatus() == UploadSessionStatus.COMPLETED
                || session.getStatus() == UploadSessionStatus.COMPLETING) {
            throw new IllegalStateException("Completing or completed upload sessions cannot be aborted");
        }
        session.setStatus(UploadSessionStatus.ABORTING);
        touch(session, now);
        checkedUpdate(session);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean markAbortingIfExpired(KnowledgeUploadSession source, LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        if (session.getStatus() == UploadSessionStatus.ABORTED
                || session.getStatus() == UploadSessionStatus.EXPIRED
                || session.getStatus() == UploadSessionStatus.COMPLETED
                || session.getStatus() == UploadSessionStatus.COMPLETING) {
            return false;
        }
        if (session.getStatus() == UploadSessionStatus.ABORTING) return true;
        if (session.getExpiresAt() != null && now.isBefore(session.getExpiresAt())
                && session.getMaxExpiresAt() != null && now.isBefore(session.getMaxExpiresAt())) {
            return false;
        }
        session.setStatus(UploadSessionStatus.ABORTING);
        touch(session, now);
        checkedUpdate(session);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public void markAborted(KnowledgeUploadSession source, String reason, LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        if (session.getStatus() == UploadSessionStatus.ABORTED) {
            return;
        }
        if (session.getStatus() != UploadSessionStatus.ABORTING) {
            throw new IllegalStateException("Upload session is not being aborted");
        }
        session.setStatus(UploadSessionStatus.ABORTED);
        session.setRetryable(false);
        session.setFailureStage("ABORT");
        session.setFailureCode("CLIENT_ABORTED");
        session.setFailureMessage(trimMessage(reason));
        touch(session, now);
        checkedUpdate(session);
    }

    @Transactional(rollbackFor = Exception.class)
    public void markExpired(KnowledgeUploadSession source, LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        if (session.getStatus() == UploadSessionStatus.COMPLETED
                || session.getStatus() == UploadSessionStatus.ABORTED
                || session.getStatus() == UploadSessionStatus.EXPIRED) {
            return;
        }
        if (session.getStatus() != UploadSessionStatus.ABORTING) {
            throw new IllegalStateException("Upload session must be claimed for cleanup before expiration");
        }
        session.setStatus(UploadSessionStatus.EXPIRED);
        session.setRetryable(false);
        session.setFailureStage("CLEANUP");
        session.setFailureCode("SESSION_EXPIRED");
        session.setFailureMessage("Upload session expired");
        session.setLastActivityTime(now);
        checkedUpdate(session);
    }

    @Transactional(rollbackFor = Exception.class)
    public void markFailed(KnowledgeUploadSession source, String stage, String code, String message,
            boolean retryable, LocalDateTime now) {
        KnowledgeUploadSession session = lockOwned(source);
        if (session.getStatus() == UploadSessionStatus.COMPLETED
                || session.getStatus() == UploadSessionStatus.ABORTED
                || session.getStatus() == UploadSessionStatus.EXPIRED
                || (session.getStatus() == UploadSessionStatus.ABORTING
                        && !"ABORT".equals(stage) && !"CLEANUP".equals(stage))) {
            return;
        }
        session.setStatus(UploadSessionStatus.FAILED);
        session.setFailureStage(stage);
        session.setFailureCode(code);
        session.setFailureMessage(trimMessage(message));
        session.setRetryable(retryable);
        session.setRetryCount(value(session.getRetryCount()) + 1);
        touch(session, now);
        checkedUpdate(session);
    }

    private void incrementConfirmedBytes(KnowledgeUploadSession session, long partSize, LocalDateTime now) {
        long confirmed = Math.min(session.getExpectedSize(), value(session.getConfirmedBytes()) + partSize);
        session.setConfirmedBytes(confirmed);
        if (session.getStatus() == UploadSessionStatus.CREATED || session.getStatus() == UploadSessionStatus.FAILED) {
            session.setStatus(UploadSessionStatus.UPLOADING);
            clearFailure(session);
        }
        touch(session, now);
        checkedUpdate(session);
    }

    private void requirePartMutationAllowed(KnowledgeUploadSession session) {
        if (session.getStatus() == UploadSessionStatus.COMPLETING
                || session.getStatus() == UploadSessionStatus.COMPLETED
                || session.getStatus() == UploadSessionStatus.ABORTING
                || session.getStatus() == UploadSessionStatus.ABORTED
                || session.getStatus() == UploadSessionStatus.EXPIRED
                || (session.getStatus() == UploadSessionStatus.FAILED && !Boolean.TRUE.equals(session.getRetryable()))) {
            throw new IllegalStateException("Upload parts cannot be changed from status " + session.getStatus());
        }
    }

    private KnowledgeUploadSession lockOwned(KnowledgeUploadSession source) {
        if (source == null || source.getId() == null || StrUtil.isBlank(source.getTenantId()) || source.getUserId() == null) {
            throw new IllegalArgumentException("Upload session ownership is required");
        }
        KnowledgeUploadSession session = sessionMapper.selectOwnedForUpdate(
                source.getId(), source.getTenantId(), source.getUserId());
        if (session == null) {
            throw new IllegalArgumentException("Upload session not found");
        }
        return session;
    }

    private void checkedUpdate(KnowledgeUploadSession session) {
        session.setVersion(value(session.getVersion()) + 1L);
        if (!sessionService.updateById(session)) {
            throw new IllegalStateException("Concurrent upload session update detected");
        }
    }

    private void checkedUpdate(KnowledgeUploadPart part) {
        if (!partService.updateById(part)) {
            throw new IllegalStateException("Concurrent upload part update detected");
        }
    }

    private void touch(KnowledgeUploadSession session, LocalDateTime now) {
        session.setLastActivityTime(now);
        LocalDateTime inactivityExpiry = now.plus(properties.getInactivityTimeout());
        session.setExpiresAt(inactivityExpiry.isBefore(session.getMaxExpiresAt())
                ? inactivityExpiry : session.getMaxExpiresAt());
    }

    private void clearFailure(KnowledgeUploadSession session) {
        session.setFailureStage(null);
        session.setFailureCode(null);
        session.setFailureMessage(null);
        session.setRetryable(true);
    }

    private boolean operationLeaseExpired(KnowledgeUploadSession session, LocalDateTime now) {
        return session.getLastActivityTime() == null
                || !session.getLastActivityTime().plus(properties.getOperationLease()).isAfter(now);
    }

    private boolean sameEtag(String left, String right) {
        return Objects.equals(normalizeEtag(left), normalizeEtag(right));
    }

    private String normalizeEtag(String etag) {
        if (etag == null) {
            return null;
        }
        String value = etag.trim();
        if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
            return value.substring(1, value.length() - 1);
        }
        return value;
    }

    private int value(Integer number) {
        return number == null ? 0 : number;
    }

    private long value(Long number) {
        return number == null ? 0L : number;
    }

    private String trimMessage(String message) {
        if (message == null) {
            return null;
        }
        return message.length() <= 2000 ? message : message.substring(0, 2000);
    }
}
