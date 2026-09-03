package com.knowledge.core.oss.multipart;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class MultipartUploadSession {

    String provider;
    String bucket;
    String objectKey;
    String uploadId;
}
