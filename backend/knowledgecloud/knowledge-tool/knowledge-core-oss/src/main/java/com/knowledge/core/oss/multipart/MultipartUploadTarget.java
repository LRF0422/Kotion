package com.knowledge.core.oss.multipart;

import java.time.Instant;
import java.util.Collections;
import java.util.Map;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class MultipartUploadTarget {

    String method;
    String url;
    @Builder.Default
    Map<String, String> headers = Collections.emptyMap();
    Instant expiresAt;
    String etagResponseHeader;
    String checksumResponseHeader;
}
