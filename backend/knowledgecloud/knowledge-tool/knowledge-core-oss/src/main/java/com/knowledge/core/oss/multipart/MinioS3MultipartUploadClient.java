package com.knowledge.core.oss.multipart;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import lombok.RequiredArgsConstructor;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.AbortMultipartUploadRequest;
import software.amazon.awssdk.services.s3.model.CompleteMultipartUploadRequest;
import software.amazon.awssdk.services.s3.model.CompletedMultipartUpload;
import software.amazon.awssdk.services.s3.model.CompletedPart;
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadRequest;
import software.amazon.awssdk.services.s3.model.CreateMultipartUploadResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.ListPartsRequest;
import software.amazon.awssdk.services.s3.model.ListPartsResponse;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.UploadPartRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedUploadPartRequest;
import software.amazon.awssdk.services.s3.presigner.model.UploadPartPresignRequest;

@RequiredArgsConstructor
public class MinioS3MultipartUploadClient implements MultipartUploadClient {

    private static final long MIN_PART_SIZE = 5L * 1024 * 1024;
    private static final long MAX_PART_SIZE = 5L * 1024 * 1024 * 1024;
    private static final int MAX_PART_COUNT = 10_000;
    private static final int MAX_TARGET_EXPIRY_SECONDS = 3_600;

    private final S3Client s3Client;
    private final S3Presigner presigner;

    @Override
    public MultipartUploadCapabilities capabilities() {
        return MultipartUploadCapabilities.builder()
                .provider("minio")
                .minPartSizeBytes(MIN_PART_SIZE)
                .maxPartSizeBytes(MAX_PART_SIZE)
                .maxPartCount(MAX_PART_COUNT)
                .maxParallelParts(4)
                .maxTargetExpirySeconds(MAX_TARGET_EXPIRY_SECONDS)
                .build();
    }

    @Override
    public MultipartUploadSession initiate(String bucket, String objectKey, String contentType) {
        CreateMultipartUploadRequest.Builder builder = CreateMultipartUploadRequest.builder()
                .bucket(bucket)
                .key(objectKey);
        if (contentType != null && !contentType.trim().isEmpty()) {
            builder.contentType(contentType);
        }
        CreateMultipartUploadResponse response = s3Client.createMultipartUpload(builder.build());
        return MultipartUploadSession.builder()
                .provider("minio")
                .bucket(bucket)
                .objectKey(objectKey)
                .uploadId(response.uploadId())
                .build();
    }

    @Override
    public MultipartUploadTarget createPartUploadTarget(
            String bucket,
            String objectKey,
            String uploadId,
            int partNumber,
            long contentLength,
            Duration expiry) {
        validatePart(partNumber, contentLength);
        Duration effectiveExpiry = expiry == null ? Duration.ofMinutes(15) : expiry;
        if (effectiveExpiry.isNegative() || effectiveExpiry.isZero()
                || effectiveExpiry.getSeconds() > MAX_TARGET_EXPIRY_SECONDS) {
            throw new IllegalArgumentException("Invalid upload target expiry");
        }

        UploadPartRequest uploadPartRequest = UploadPartRequest.builder()
                .bucket(bucket)
                .key(objectKey)
                .uploadId(uploadId)
                .partNumber(partNumber)
                .contentLength(contentLength)
                .build();
        PresignedUploadPartRequest presigned = presigner.presignUploadPart(
                UploadPartPresignRequest.builder()
                        .signatureDuration(effectiveExpiry)
                        .uploadPartRequest(uploadPartRequest)
                        .build());

        Map<String, String> headers = new LinkedHashMap<>();
        presigned.signedHeaders().forEach((name, values) -> {
            if (!values.isEmpty()) headers.put(name, String.join(",", values));
        });
        return MultipartUploadTarget.builder()
                .method(presigned.httpRequest().method().name())
                .url(presigned.url().toString())
                .headers(headers)
                .expiresAt(Instant.now().plus(effectiveExpiry))
                .etagResponseHeader("ETag")
                .build();
    }

    @Override
    public List<MultipartUploadedPart> listParts(String bucket, String objectKey, String uploadId) {
        List<MultipartUploadedPart> result = new ArrayList<>();
        Integer marker = null;
        boolean truncated;
        do {
            ListPartsResponse response = s3Client.listParts(ListPartsRequest.builder()
                    .bucket(bucket)
                    .key(objectKey)
                    .uploadId(uploadId)
                    .partNumberMarker(marker)
                    .maxParts(1000)
                    .build());
            response.parts().forEach(part -> result.add(MultipartUploadedPart.builder()
                    .partNumber(part.partNumber())
                    .sizeBytes(part.size())
                    .etag(part.eTag())
                    .checksum(part.checksumSHA256())
                    .build()));
            truncated = Boolean.TRUE.equals(response.isTruncated());
            marker = response.nextPartNumberMarker();
        } while (truncated);
        return result;
    }

    @Override
    public MultipartObjectStat complete(
            String bucket,
            String objectKey,
            String uploadId,
            List<MultipartUploadedPart> parts) {
        if (parts == null || parts.isEmpty()) {
            throw new IllegalArgumentException("Multipart upload requires at least one part");
        }
        List<CompletedPart> completedParts = parts.stream()
                .sorted(Comparator.comparingInt(MultipartUploadedPart::getPartNumber))
                .map(part -> CompletedPart.builder()
                        .partNumber(part.getPartNumber())
                        .eTag(part.getEtag())
                        .checksumSHA256(part.getChecksum())
                        .build())
                .collect(Collectors.toList());
        s3Client.completeMultipartUpload(CompleteMultipartUploadRequest.builder()
                .bucket(bucket)
                .key(objectKey)
                .uploadId(uploadId)
                .multipartUpload(CompletedMultipartUpload.builder().parts(completedParts).build())
                .build());
        return stat(bucket, objectKey);
    }

    @Override
    public void abort(String bucket, String objectKey, String uploadId) {
        try {
            s3Client.abortMultipartUpload(AbortMultipartUploadRequest.builder()
                    .bucket(bucket)
                    .key(objectKey)
                    .uploadId(uploadId)
                    .build());
        } catch (S3Exception exception) {
            String errorCode = exception.awsErrorDetails() == null
                    ? null : exception.awsErrorDetails().errorCode();
            if (exception.statusCode() == 404 || "NoSuchUpload".equals(errorCode)) {
                return;
            }
            throw exception;
        }
    }

    @Override
    public MultipartObjectStat stat(String bucket, String objectKey) {
        HeadObjectResponse response = s3Client.headObject(HeadObjectRequest.builder()
                .bucket(bucket)
                .key(objectKey)
                .build());
        return MultipartObjectStat.builder()
                .bucket(bucket)
                .objectKey(objectKey)
                .sizeBytes(response.contentLength())
                .etag(response.eTag())
                .contentType(response.contentType())
                .lastModified(response.lastModified())
                .build();
    }

    private void validatePart(int partNumber, long contentLength) {
        if (partNumber < 1 || partNumber > MAX_PART_COUNT) {
            throw new IllegalArgumentException("Invalid multipart part number");
        }
        if (contentLength < 0 || contentLength > MAX_PART_SIZE) {
            throw new IllegalArgumentException("Invalid multipart part size");
        }
    }
}
