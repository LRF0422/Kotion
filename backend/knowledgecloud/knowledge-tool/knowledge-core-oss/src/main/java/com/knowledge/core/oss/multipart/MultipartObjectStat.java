package com.knowledge.core.oss.multipart;

import java.time.Instant;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class MultipartObjectStat {

    String bucket;
    String objectKey;
    long sizeBytes;
    String etag;
    String contentType;
    Instant lastModified;
}
