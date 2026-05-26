package com.knowledge.filecenter.skill;

import java.net.CookieHandler;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URL;
import java.net.URLDecoder;
import java.util.Random;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;

import com.knowledge.core.agent.annotation.AgentSkill;
import com.knowledge.core.agent.annotation.SkillTierValue;
import com.knowledge.core.agent.annotation.SkillTool;
import com.knowledge.core.agent.annotation.ToolParam;
import com.knowledge.filecenter.application.FileApplication;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;

import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import lombok.extern.slf4j.Slf4j;

/**
 * Web Download skill using annotation-based registration.
 * <p>
 * Downloads files from URLs with comprehensive anti-crawling countermeasures
 * and saves them directly into the file center's folder structure.
 * <p>
 * Anti-crawling features:
 * <ul>
 * <li>User-Agent rotation — random realistic browser UA per request</li>
 * <li>Referer spoofing — auto-derived from URL origin to bypass
 * anti-hotlink</li>
 * <li>Full browser-like headers (Sec-Ch-Ua, Sec-Fetch-*, etc.)</li>
 * <li>Cookie session tracking across redirects</li>
 * <li>Retry with exponential backoff + random jitter on 429/5xx</li>
 * <li>Optional HEAD pre-check before full GET download</li>
 * <li>Content-Disposition filename extraction (RFC 5987)</li>
 * <li>Configurable max file size to prevent resource exhaustion</li>
 * </ul>
 *
 * Tools provided:
 * <ul>
 * <li><b>download_file</b> - Download a file from URL and save to a file center
 * folder</li>
 * </ul>
 */
@Slf4j
@AgentSkill(id = "web-download", name = "Web Download", description = "Download files from URLs and save them to the file center. "
        + "Handles anti-crawling protections including User-Agent rotation, cookie sessions, "
        + "retry with backoff, and HEAD pre-checks. "
        + "Downloaded files are saved into specified folders in the file center "
        + "and uploaded to cloud storage.", version = "1.0.0", author = "KnowledgeCloud", tier = SkillTierValue.DOMAIN, categories = {
                "file-management", "web", "download" })
public class WebDownloadSkill {

    // =========================================================================
    // User-Agent rotation pool
    // =========================================================================

    private static final String[] USER_AGENTS = {
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/121.0.2277.128",
    };

    private static final Pattern URL_PATTERN = Pattern.compile("^https?://.*", Pattern.CASE_INSENSITIVE);
    private static final Pattern CONTENT_DISPOSITION_FILENAME = Pattern.compile(
            "filename\\*?=(?:UTF-8''|\"?)([^\";]+)", Pattern.CASE_INSENSITIVE);

    /** Base delay in milliseconds for exponential backoff. */
    private static final int BASE_RETRY_DELAY_MS = 1000;
    /** Maximum random jitter added to retry delay (milliseconds). */
    private static final int MAX_JITTER_MS = 500;

    private final Random random = new Random();

    @Autowired
    private WebDownloadProperties properties;

    @Autowired
    private FileApplication fileApplication;

    // =========================================================================
    // Tool: download_file
    // =========================================================================

    /**
     * Download a file from a URL and save it to a folder in the file center.
     *
     * @param fileUrl       the URL of the file to download
     * @param fileName      custom filename (optional, derived from URL or
     *                      Content-Disposition)
     * @param parentId      the parent folder ID to save the file into (null/0 for
     *                      root)
     * @param repositoryKey the repository key (null for default)
     * @param checkFirst    whether to HEAD-check the URL before downloading
     *                      (default: true)
     * @return result message with file details
     */
    @SkillTool(name = "download_file", description = "Download a file from a URL and save it to a folder in the file center. "
            + "Handles anti-crawling protections (User-Agent rotation, cookies, retries with backoff, HEAD pre-check). "
            + "The file is uploaded to cloud storage and a record is created in the file center. "
            + "Returns the saved file's ID, name, size, and folder info.")
    public String downloadFile(
            @ToolParam(name = "fileUrl", description = "The URL of the file to download.", type = "string", required = true) String fileUrl,
            @ToolParam(name = "fileName", description = "Custom filename for the saved file. If not provided, derived from the URL or Content-Disposition header.", type = "string", required = false) String fileName,
            @ToolParam(name = "parentId", description = "The parent folder ID to save the file into. Use 0 or null for root.", type = "number", required = false) Long parentId,
            @ToolParam(name = "repositoryKey", description = "The repository key. Leave empty to use the default repository.", type = "string", required = false) String repositoryKey,
            @ToolParam(name = "checkFirst", description = "Whether to send a HEAD request first to verify accessibility before downloading (default: true).", type = "boolean", required = false) Boolean checkFirst) {

        if (StrUtil.isBlank(fileUrl)) {
            return "Error: Missing required parameter: fileUrl";
        }
        if (!URL_PATTERN.matcher(fileUrl).matches()) {
            return "Error: Invalid URL format. URL must start with http:// or https://";
        }
        if (!properties.isEnabled()) {
            return "Error: Web Download skill is disabled.";
        }

        boolean shouldCheckFirst = checkFirst != null ? checkFirst : properties.isHeadCheckEnabled();

        log.info("WebDownloadSkill downloading: url='{}', fileName='{}', parentId={}, checkFirst={}",
                fileUrl, fileName, parentId, shouldCheckFirst);

        try {
            // Phase 1: Optional HEAD check
            if (shouldCheckFirst) {
                HeadCheckResult check = headCheck(fileUrl);
                if (!check.accessible) {
                    return "Error: URL is not accessible — " + check.errorMessage;
                }
                // Use Content-Disposition filename if no custom name provided
                if (StrUtil.isBlank(fileName) && StrUtil.isNotBlank(check.suggestedFileName)) {
                    fileName = check.suggestedFileName;
                }
                // Pre-check file size if server reports it
                if (check.contentLength > 0 && check.contentLength > properties.getMaxDownloadSize()) {
                    return "Error: Remote file size (" + formatSize(check.contentLength)
                            + ") exceeds maximum allowed size (" + formatSize(properties.getMaxDownloadSize()) + ")";
                }
            }

            // Derive filename from URL if still not set
            if (StrUtil.isBlank(fileName)) {
                fileName = deriveFileNameFromUrl(fileUrl);
            }

            // Phase 2: Download the file bytes with anti-crawling measures
            byte[] fileBytes = downloadWithRetry(fileUrl);

            if (fileBytes == null || fileBytes.length == 0) {
                return "Error: Downloaded file is empty from URL: " + fileUrl;
            }

            // Check size limit
            if (fileBytes.length > properties.getMaxDownloadSize()) {
                return "Error: File size (" + formatSize(fileBytes.length)
                        + ") exceeds maximum allowed size (" + formatSize(properties.getMaxDownloadSize()) + ")";
            }

            // Phase 3: Save to file center via FileApplication
            KnowledgeFileVO fileVO = fileApplication.saveDownloadedFile(fileBytes, fileName, parentId, repositoryKey);

            // Build result
            StringBuilder result = new StringBuilder();
            result.append("# File Downloaded\n\n");
            result.append("**File ID:** ").append(fileVO.getId()).append("\n");
            result.append("**Name:** ").append(fileVO.getName()).append("\n");
            result.append("**Size:** ").append(fileVO.getSize() != null ? formatSize(fileVO.getSize()) : "unknown")
                    .append(" (").append(fileVO.getSize() != null ? fileVO.getSize() : 0).append(" bytes)\n");
            result.append("**Parent ID:** ").append(fileVO.getParentId()).append("\n");
            if (StrUtil.isNotBlank(fileVO.getRepositoryKey())) {
                result.append("**Repository:** ").append(fileVO.getRepositoryKey()).append("\n");
            }
            if (StrUtil.isNotBlank(fileVO.getPath())) {
                result.append("**Storage Path:** ").append(fileVO.getPath()).append("\n");
            }
            result.append("**Source URL:** ").append(fileUrl).append("\n");
            result.append("\nFile downloaded and saved to the file center successfully.");

            log.info("WebDownloadSkill downloaded '{}' saved as id={}", fileUrl, fileVO.getId());
            return result.toString();

        } catch (Exception e) {
            log.error("WebDownloadSkill download error for URL '{}': {}", fileUrl, e.getMessage(), e);
            return "Error downloading file: " + e.getMessage();
        }
    }

    // =========================================================================
    // HEAD check — verify URL accessibility before full download
    // =========================================================================

    private HeadCheckResult headCheck(String url) {
        try {
            String referer = deriveReferer(url);
            String userAgent = pickUserAgent();

            try (HttpResponse response = HttpRequest.head(url)
                    .header("User-Agent", userAgent)
                    .header("Referer", referer)
                    .header("Accept", "*/*")
                    .header("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7")
                    .timeout(properties.getTimeoutSeconds() * 1000)
                    .setFollowRedirects(true)
                    .execute()) {

                int status = response.getStatus();
                if (status >= 400) {
                    return new HeadCheckResult(false, "HTTP " + status, null, -1, null);
                }

                String contentType = response.header("Content-Type");
                long contentLength = parseLong(response.header("Content-Length"), -1);
                String disposition = response.header("Content-Disposition");
                String suggestedName = StrUtil.isNotBlank(disposition)
                        ? extractFilenameFromDisposition(disposition)
                        : null;

                return new HeadCheckResult(true, null, suggestedName, contentLength, contentType);
            }
        } catch (Exception e) {
            log.warn("HEAD check failed for '{}': {}", url, e.getMessage());
            // Don't block download if HEAD is not supported — just skip the check
            return new HeadCheckResult(true, null, null, -1, null);
        }
    }

    // =========================================================================
    // Download with retry and anti-crawling measures
    // =========================================================================

    /**
     * Download file bytes from a URL with full anti-crawling countermeasures.
     * Retries on transient errors (HTTP 429, 5xx) with exponential backoff.
     */
    private byte[] downloadWithRetry(String fileUrl) throws Exception {
        String referer = deriveReferer(fileUrl);
        int effectiveRetries = properties.getRetryCount() > 0 ? properties.getRetryCount() : 3;

        for (int attempt = 0; attempt <= effectiveRetries; attempt++) {
            try {
                String userAgent = pickUserAgent();

                // Enable cookie handling to maintain session across redirects
                CookieManager cookieManager = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
                CookieHandler.setDefault(cookieManager);

                try (HttpResponse response = HttpRequest.get(fileUrl)
                        .header("User-Agent", userAgent)
                        .header("Referer", referer)
                        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,"
                                + "image/avif,image/webp,image/apng,*/*;q=0.8,"
                                + "application/signed-exchange;v=b3;q=0.7")
                        .header("Accept-Language", "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7")
                        .header("Accept-Encoding", "gzip, deflate, br")
                        .header("Cache-Control", "no-cache")
                        .header("Pragma", "no-cache")
                        .header("Sec-Ch-Ua",
                                "\"Chromium\";v=\"122\", \"Not(A:Brand\";v=\"24\", \"Google Chrome\";v=\"122\"")
                        .header("Sec-Ch-Ua-Mobile", "?0")
                        .header("Sec-Ch-Ua-Platform", "\"Windows\"")
                        .header("Sec-Fetch-Dest", "document")
                        .header("Sec-Fetch-Mode", "navigate")
                        .header("Sec-Fetch-Site", "same-origin")
                        .header("Sec-Fetch-User", "?1")
                        .header("Upgrade-Insecure-Requests", "1")
                        .timeout(properties.getTimeoutSeconds() * 1000)
                        .setFollowRedirects(true)
                        .execute()) {

                    int status = response.getStatus();

                    // Handle rate limiting (429) and server errors (5xx) with retry
                    if ((status == 429 || status >= 500) && attempt < effectiveRetries) {
                        long delay = calculateRetryDelay(attempt);
                        log.warn("HTTP {} on attempt {}/{} for '{}', retrying in {}ms...",
                                status, attempt + 1, effectiveRetries + 1, fileUrl, delay);
                        Thread.sleep(delay);
                        continue;
                    }

                    if (status >= 400) {
                        throw new RuntimeException("HTTP " + status + " downloading from URL: " + fileUrl);
                    }

                    byte[] body = response.bodyBytes();
                    if (body == null || body.length == 0) {
                        throw new RuntimeException("Downloaded file is empty from URL: " + fileUrl);
                    }

                    return body;
                }

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new RuntimeException("Download interrupted", e);
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                if (attempt >= effectiveRetries) {
                    throw e;
                }
                long delay = calculateRetryDelay(attempt);
                log.warn("Download attempt {}/{} failed for '{}': {}, retrying in {}ms...",
                        attempt + 1, effectiveRetries + 1, fileUrl, e.getMessage(), delay);
                try {
                    Thread.sleep(delay);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Download interrupted during retry", ie);
                }
            }
        }

        throw new RuntimeException("All download attempts exhausted for URL: " + fileUrl);
    }

    // =========================================================================
    // Anti-crawling helpers
    // =========================================================================

    /**
     * Pick a random User-Agent from the pool to avoid detection patterns.
     */
    private String pickUserAgent() {
        return USER_AGENTS[random.nextInt(USER_AGENTS.length)];
    }

    /**
     * Calculate retry delay with exponential backoff and random jitter.
     * Mimics human-like retry behaviour and avoids synchronized retry storms.
     */
    private long calculateRetryDelay(int attempt) {
        long baseDelay = (long) (BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
        long jitter = random.nextInt(MAX_JITTER_MS);
        return baseDelay + jitter;
    }

    /**
     * Derive a Referer value from the URL's origin to satisfy anti-hotlink checks.
     */
    private String deriveReferer(String url) {
        try {
            URL u = new URL(url);
            return u.getProtocol() + "://" + u.getHost() + "/";
        } catch (Exception e) {
            return "";
        }
    }

    // =========================================================================
    // Filename helpers
    // =========================================================================

    /**
     * Derive a file name from the URL path.
     */
    private String deriveFileNameFromUrl(String url) {
        try {
            String path = new URL(url).getPath();
            String name = path.substring(path.lastIndexOf('/') + 1);

            // Remove query parameters and fragments
            int queryIdx = name.indexOf('?');
            if (queryIdx > 0) {
                name = name.substring(0, queryIdx);
            }
            int fragmentIdx = name.indexOf('#');
            if (fragmentIdx > 0) {
                name = name.substring(0, fragmentIdx);
            }

            // URL decode
            name = URLDecoder.decode(name, "UTF-8");

            if (StrUtil.isBlank(name) || name.equals("/")) {
                name = "downloaded_file";
            }

            return name;
        } catch (Exception e) {
            return "downloaded_file";
        }
    }

    /**
     * Extract filename from Content-Disposition header.
     * Supports both filename="..." and filename*=UTF-8''... forms (RFC 5987).
     */
    private String extractFilenameFromDisposition(String disposition) {
        if (StrUtil.isBlank(disposition)) {
            return null;
        }
        Matcher m = CONTENT_DISPOSITION_FILENAME.matcher(disposition);
        if (m.find()) {
            String name = m.group(1).trim();
            try {
                name = URLDecoder.decode(name, "UTF-8");
            } catch (Exception ignored) {
            }
            return name;
        }
        return null;
    }

    // =========================================================================
    // Utility helpers
    // =========================================================================

    private long parseLong(String value, long defaultValue) {
        if (StrUtil.isBlank(value)) {
            return defaultValue;
        }
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private String formatSize(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        } else if (bytes < 1024 * 1024) {
            return String.format("%.1f KB", bytes / 1024.0);
        } else if (bytes < 1024L * 1024 * 1024) {
            return String.format("%.1f MB", bytes / (1024.0 * 1024));
        } else {
            return String.format("%.1f GB", bytes / (1024.0 * 1024 * 1024));
        }
    }

    // =========================================================================
    // Inner classes
    // =========================================================================

    private static class HeadCheckResult {
        final boolean accessible;
        final String errorMessage;
        final String suggestedFileName;
        final long contentLength;
        final String contentType;

        HeadCheckResult(boolean accessible, String errorMessage, String suggestedFileName,
                long contentLength, String contentType) {
            this.accessible = accessible;
            this.errorMessage = errorMessage;
            this.suggestedFileName = suggestedFileName;
            this.contentLength = contentLength;
            this.contentType = contentType;
        }
    }
}
