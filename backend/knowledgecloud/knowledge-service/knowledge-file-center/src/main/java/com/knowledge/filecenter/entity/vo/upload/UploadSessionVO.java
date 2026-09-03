package com.knowledge.filecenter.entity.vo.upload;

import java.time.LocalDateTime;
import java.util.List;

import com.knowledge.filecenter.entity.enums.UploadSessionStatus;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class UploadSessionVO {
    Long id;
    String clientUuid;
    String repositoryKey;
    Long parentId;
    String originalName;
    String contentType;
    long expectedSize;
    long partSize;
    int partCount;
    long confirmedBytes;
    UploadSessionStatus status;
    String failureStage;
    String failureCode;
    String failureMessage;
    boolean retryable;
    int retryCount;
    Long completedFileId;
    KnowledgeFileVO completedFile;
    String checksumAlgorithm;
    String checksum;
    LocalDateTime lastActivityTime;
    LocalDateTime expiresAt;
    LocalDateTime maxExpiresAt;
    List<UploadPartVO> parts;
}
