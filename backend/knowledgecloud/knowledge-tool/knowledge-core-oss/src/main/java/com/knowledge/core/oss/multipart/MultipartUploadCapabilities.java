package com.knowledge.core.oss.multipart;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class MultipartUploadCapabilities {

    String provider;
    long minPartSizeBytes;
    long maxPartSizeBytes;
    int maxPartCount;
    int maxParallelParts;
    int maxTargetExpirySeconds;
}
