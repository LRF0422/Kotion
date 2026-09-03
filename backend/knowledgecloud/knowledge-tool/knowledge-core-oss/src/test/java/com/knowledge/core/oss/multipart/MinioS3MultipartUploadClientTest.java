package com.knowledge.core.oss.multipart;

import java.time.Duration;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.S3Exception;

class MinioS3MultipartUploadClientTest {

    private final MinioS3MultipartUploadClient client = new MinioS3MultipartUploadClient(null, null);

    @Test
    void exposesS3CompatibleMultipartLimits() {
        MultipartUploadCapabilities capabilities = client.capabilities();

        assertEquals("minio", capabilities.getProvider());
        assertEquals(5L * 1024 * 1024, capabilities.getMinPartSizeBytes());
        assertEquals(5L * 1024 * 1024 * 1024, capabilities.getMaxPartSizeBytes());
        assertEquals(10_000, capabilities.getMaxPartCount());
        assertEquals(4, capabilities.getMaxParallelParts());
    }

    @Test
    void rejectsInvalidPartNumberBeforeSigning() {
        assertThrows(IllegalArgumentException.class, () -> client.createPartUploadTarget(
                "bucket", "object", "upload", 0, 1024, Duration.ofMinutes(15)));
    }

    @Test
    void rejectsOversizedPartBeforeSigning() {
        assertThrows(IllegalArgumentException.class, () -> client.createPartUploadTarget(
                "bucket", "object", "upload", 1, 5L * 1024 * 1024 * 1024 + 1, Duration.ofMinutes(15)));
    }

    @Test
    void rejectsExcessiveTargetExpiryBeforeSigning() {
        assertThrows(IllegalArgumentException.class, () -> client.createPartUploadTarget(
                "bucket", "object", "upload", 1, 1024, Duration.ofHours(2)));
    }

    @Test
    void abortTreatsMissingProviderUploadAsIdempotentSuccess() {
        S3Client s3Client = mock(S3Client.class);
        doThrow(S3Exception.builder().statusCode(404).message("missing").build())
                .when(s3Client).abortMultipartUpload(any(software.amazon.awssdk.services.s3.model.AbortMultipartUploadRequest.class));
        MinioS3MultipartUploadClient abortClient = new MinioS3MultipartUploadClient(s3Client, null);

        assertDoesNotThrow(() -> abortClient.abort("bucket", "object", "upload"));
    }
}
