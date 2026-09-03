package com.knowledge.filecenter.upload;

import java.time.Duration;
import java.util.List;

import com.knowledge.core.oss.multipart.MultipartObjectStat;
import com.knowledge.core.oss.multipart.MultipartUploadCapabilities;
import com.knowledge.core.oss.multipart.MultipartUploadClient;
import com.knowledge.core.oss.multipart.MultipartUploadSession;
import com.knowledge.core.oss.multipart.MultipartUploadTarget;
import com.knowledge.core.oss.multipart.MultipartUploadedPart;

public class UnsupportedMultipartUploadClient implements MultipartUploadClient {

    private final String provider;

    public UnsupportedMultipartUploadClient(String provider) {
        this.provider = provider;
    }

    @Override
    public MultipartUploadCapabilities capabilities() {
        throw unsupported();
    }

    @Override
    public MultipartUploadSession initiate(String bucket, String objectKey, String contentType) {
        throw unsupported();
    }

    @Override
    public MultipartUploadTarget createPartUploadTarget(String bucket, String objectKey, String uploadId,
            int partNumber, long contentLength, Duration expiry) {
        throw unsupported();
    }

    @Override
    public List<MultipartUploadedPart> listParts(String bucket, String objectKey, String uploadId) {
        throw unsupported();
    }

    @Override
    public MultipartObjectStat complete(String bucket, String objectKey, String uploadId,
            List<MultipartUploadedPart> parts) {
        throw unsupported();
    }

    @Override
    public void abort(String bucket, String objectKey, String uploadId) {
        throw unsupported();
    }

    @Override
    public MultipartObjectStat stat(String bucket, String objectKey) {
        throw unsupported();
    }

    private IllegalStateException unsupported() {
        return new IllegalStateException("Resumable upload is unavailable for storage provider " + provider);
    }
}
