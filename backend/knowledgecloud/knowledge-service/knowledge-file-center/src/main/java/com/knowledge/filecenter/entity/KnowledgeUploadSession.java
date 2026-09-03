package com.knowledge.filecenter.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.filecenter.entity.enums.UploadSessionStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_upload_session")
public class KnowledgeUploadSession extends TenantEntity {

    private Long id;
    private Long userId;
    private String clientUuid;
    private String repositoryKey;
    private Long parentId;
    private String originalName;
    private String contentType;
    private Long expectedSize;
    private String provider;
    private String bucket;
    private String objectKey;
    private String providerUploadId;
    private Long partSize;
    private Integer partCount;
    private Long confirmedBytes;
    private UploadSessionStatus status;
    private String failureStage;
    private String failureCode;
    private String failureMessage;
    private Boolean retryable;
    private Integer retryCount;
    private Long completedFileId;
    private String checksumAlgorithm;
    private String checksum;
    @Version
    private Long version;
    private LocalDateTime lastActivityTime;
    private LocalDateTime expiresAt;
    private LocalDateTime maxExpiresAt;
}
