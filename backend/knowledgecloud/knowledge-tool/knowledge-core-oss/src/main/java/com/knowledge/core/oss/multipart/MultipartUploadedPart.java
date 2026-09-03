package com.knowledge.core.oss.multipart;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class MultipartUploadedPart {

    int partNumber;
    long sizeBytes;
    String etag;
    String checksum;
}
