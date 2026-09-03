package com.knowledge.core.oss.multipart;

import java.time.Duration;
import java.util.List;

public interface MultipartUploadClient {

    MultipartUploadCapabilities capabilities();

    MultipartUploadSession initiate(String bucket, String objectKey, String contentType);

    MultipartUploadTarget createPartUploadTarget(
            String bucket,
            String objectKey,
            String uploadId,
            int partNumber,
            long contentLength,
            Duration expiry);

    List<MultipartUploadedPart> listParts(String bucket, String objectKey, String uploadId);

    MultipartObjectStat complete(
            String bucket,
            String objectKey,
            String uploadId,
            List<MultipartUploadedPart> parts);

    void abort(String bucket, String objectKey, String uploadId);

    MultipartObjectStat stat(String bucket, String objectKey);
}
