package com.knowledge.filecenter.skill;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Data;

/**
 * Configuration properties for the Web Download skill.
 *
 * <p>
 * Controls download behaviour, anti-crawling settings, and file size limits.
 *
 * <p>
 * Example configuration:
 *
 * <pre>
 * agent:
 *   skill:
 *     web-download:
 *       enabled: true
 *       timeout-seconds: 30
 *       max-download-size: 104857600
 *       head-check-enabled: true
 *       retry-count: 3
 * </pre>
 */
@Data
@Component
@ConfigurationProperties(prefix = "agent.skill.web-download")
public class WebDownloadProperties {

    /**
     * Whether the web download skill is enabled.
     */
    private boolean enabled = true;

    /**
     * HTTP request timeout in seconds.
     */
    private int timeoutSeconds = 30;

    /**
     * Maximum file size to download in bytes (default 100MB).
     * Prevents downloading excessively large files.
     */
    private long maxDownloadSize = 104857600L;

    /**
     * Whether to send a HEAD request first to check URL accessibility
     * and retrieve metadata (Content-Length, Content-Disposition) before
     * committing to the full GET download.
     */
    private boolean headCheckEnabled = true;

    /**
     * Maximum number of retries for transient HTTP errors (429, 5xx).
     */
    private int retryCount = 3;

    /**
     * Default User-Agent string. Used as fallback when UA rotation is disabled
     * or when a single consistent UA is needed.
     */
    private String userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
}
