package com.knowledge.filecenter.storage;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.knowledge.core.oss.props.OssProperties;

import cn.hutool.core.util.StrUtil;

/**
 * Resolves the canonical OSS object key stored in knowledge_file.path.
 *
 * New rows already contain an object key. Legacy rows may contain a MinIO URL
 * built from the configured endpoint, bucket, and object key.
 */
@Component
public class LegacyOssObjectKeyResolver {

    private OssProperties ossProperties;

    public LegacyOssObjectKeyResolver() {
    }

    public LegacyOssObjectKeyResolver(OssProperties ossProperties) {
        this.ossProperties = ossProperties;
    }

    @Autowired(required = false)
    public void setOssProperties(OssProperties ossProperties) {
        this.ossProperties = ossProperties;
    }

    public String resolve(String storedPath) {
        if (StrUtil.isBlank(storedPath)) {
            throw new IllegalArgumentException("OSS path cannot be blank");
        }

        String path = storedPath.trim();
        if (!isHttpUrl(path)) {
            return path;
        }
        if (ossProperties == null || StrUtil.isBlank(ossProperties.getEndpoint())
                || StrUtil.isBlank(ossProperties.getBucketName())) {
            throw new IllegalStateException("OSS endpoint and bucket must be configured to resolve a legacy URL");
        }

        URI storedUri = parseUri(path, "legacy OSS path");
        URI endpointUri = parseUri(ossProperties.getEndpoint(), "configured OSS endpoint");
        if (!sameOrigin(storedUri, endpointUri)) {
            throw new IllegalArgumentException("Legacy OSS path does not match the configured endpoint: " + storedPath);
        }

        String storedUriPath = decodePath(storedUri.getRawPath());
        String endpointPath = trimTrailingSlash(decodePath(endpointUri.getRawPath()));
        String expectedPrefix = endpointPath + "/" + ossProperties.getBucketName() + "/";
        if (!storedUriPath.startsWith(expectedPrefix)) {
            throw new IllegalArgumentException("Legacy OSS path does not match the configured bucket: " + storedPath);
        }

        String objectKey = storedUriPath.substring(expectedPrefix.length());
        if (StrUtil.isBlank(objectKey)) {
            throw new IllegalArgumentException("Legacy OSS path does not contain an object key: " + storedPath);
        }
        return objectKey;
    }

    private static boolean isHttpUrl(String value) {
        return value.regionMatches(true, 0, "http://", 0, 7)
                || value.regionMatches(true, 0, "https://", 0, 8);
    }

    private static URI parseUri(String value, String label) {
        try {
            URI uri = URI.create(value);
            if (StrUtil.isBlank(uri.getScheme()) || StrUtil.isBlank(uri.getHost())) {
                throw new IllegalArgumentException(label + " is not an absolute URL: " + value);
            }
            return uri;
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Invalid " + label + ": " + value, exception);
        }
    }

    private static boolean sameOrigin(URI left, URI right) {
        return left.getScheme().equalsIgnoreCase(right.getScheme())
                && left.getHost().equalsIgnoreCase(right.getHost())
                && effectivePort(left) == effectivePort(right);
    }

    private static int effectivePort(URI uri) {
        if (uri.getPort() >= 0) return uri.getPort();
        return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
    }

    private static String decodePath(String rawPath) {
        if (rawPath == null) return "";
        try {
            return URLDecoder.decode(rawPath.replace("+", "%2B"), StandardCharsets.UTF_8.name());
        } catch (Exception exception) {
            throw new IllegalArgumentException("Failed to decode OSS path: " + rawPath, exception);
        }
    }

    private static String trimTrailingSlash(String value) {
        String result = value == null ? "" : value;
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }
}
