package com.knowledge.filecenter.entity.vo.upload;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class UploadCapabilitiesVO {
    String provider;
    long maxFileSizeBytes;
    long defaultPartSizeBytes;
    long minPartSizeBytes;
    long maxPartSizeBytes;
    int maxPartCount;
    int maxParallelParts;
    int targetExpirySeconds;
}
