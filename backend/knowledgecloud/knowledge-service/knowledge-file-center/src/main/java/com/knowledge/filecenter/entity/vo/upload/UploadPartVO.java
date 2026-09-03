package com.knowledge.filecenter.entity.vo.upload;

import java.time.LocalDateTime;

import com.knowledge.filecenter.entity.enums.UploadPartStatus;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class UploadPartVO {
    int partNumber;
    long byteOffset;
    long sizeBytes;
    UploadPartStatus status;
    String etag;
    String providerChecksum;
    String checksumAlgorithm;
    String checksum;
    int attemptCount;
    LocalDateTime uploadedAt;
}
