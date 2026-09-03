package com.knowledge.filecenter.upload;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.knowledge.filecenter.application.UploadSessionApplication;
import com.knowledge.filecenter.entity.KnowledgeUploadSession;
import com.knowledge.filecenter.mapper.UploadSessionMapper;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class UploadSessionMaintenance {

    private final UploadSessionMapper sessionMapper;
    private final UploadSessionApplication application;
    private final UploadSessionProperties properties;

    @Scheduled(fixedDelayString = "${file.upload.cleanup-delay-ms:3600000}")
    public void maintainUploadSessions() {
        int limit = Math.max(1, Math.min(properties.getCleanupBatchSize(), 500));
        LocalDateTime now = LocalDateTime.now();
        if (properties.isCleanupEnabled()) {
            List<KnowledgeUploadSession> expired = sessionMapper.selectExpired(now, limit);
            for (KnowledgeUploadSession session : expired) {
                application.expireForCleanup(session);
            }
        }
        if (properties.isReconcileEnabled()) {
            LocalDateTime cutoff = now.minus(properties.getReconcileAfter());
            List<KnowledgeUploadSession> stale = sessionMapper.selectStaleUploading(cutoff, limit);
            for (KnowledgeUploadSession session : stale) {
                application.reconcileForCleanup(session);
            }
        }
    }
}
