package com.knowledge.filecenter.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.filecenter.entity.enums.UploadPartStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_upload_part")
public class KnowledgeUploadPart extends TenantEntity {

    private Long id;
    private Long userId;
    private Long uploadSessionId;
    private Integer partNumber;
    private Long byteOffset;
    private Long partSize;
    private String etag;
    private String providerChecksum;
    private String checksumAlgorithm;
    private String checksum;
    private UploadPartStatus status;
    private Integer attemptCount;
    private LocalDateTime uploadedAt;
}
