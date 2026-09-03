package com.knowledge.filecenter.entity.vo.upload;

import java.time.Instant;
import java.util.Map;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class SignedUploadPartVO {
    int partNumber;
    long byteOffset;
    long sizeBytes;
    String method;
    String url;
    Map<String, String> headers;
    Instant expiresAt;
    String etagResponseHeader;
    String checksumResponseHeader;
}
