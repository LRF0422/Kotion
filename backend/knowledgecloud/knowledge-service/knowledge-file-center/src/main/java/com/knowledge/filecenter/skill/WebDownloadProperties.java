package com.knowledge.filecenter.skill;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Data;

/**
 * Configuration properties for the Web Download skill.
 *
 * <p>Controls download behaviour, SSRF protection, anti-crawling settings and
 * file size limits. The downloader itself lives in
 * {@code com.knowledge.filecenter.service.RemoteFileDownloadService} and is
 * shared by the {@code download_file} skill tool and
 * {@code FileApplication#downloadFromUrl}.
 *
 * <p>Example configuration:
 *
 * <pre>
 * agent:
 *   skill:
 *     web-download:
 *       enabled: true
 *       timeout-seconds: 30
 *       connect-timeout-seconds: 10
 *       max-download-size: 104857600
 *       head-check-enabled: true
 *       retry-count: 3
 *       max-redirects: 5
 *       block-private-addresses: true
 *       allowed-hosts: []
 *       max-file-name-length: 200
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
     * Read timeout in seconds for the download connection.
     */
    private int timeoutSeconds = 30;

    /**
     * Connect timeout in seconds for the download connection.
     */
    private int connectTimeoutSeconds = 10;

    /**
     * Maximum file size to download in bytes (default 100MB).
     * Enforced against Content-Length and while streaming, so a server that
     * lies about the size still cannot exhaust memory or disk.
     */
    private long maxDownloadSize = 104857600L;

    /**
     * Whether to send a HEAD request first to check URL accessibility
     * and retrieve metadata (Content-Length, Content-Disposition, Content-Type)
     * before committing to the full GET download.
     */
    private boolean headCheckEnabled = true;

    /**
     * Maximum number of retries for transient HTTP errors (429, 5xx) and
     * network failures. Backoff is exponential with jitter.
     */
    private int retryCount = 3;

    /**
     * Maximum number of HTTP redirects followed. Every hop is re-validated
     * against the SSRF rules, so a public URL cannot redirect into the private
     * network.
     */
    private int maxRedirects = 5;

    /**
     * Reject URLs that resolve to loopback, link-local, site-local, CGNAT or
     * unique-local addresses. Enabled by default — this is the primary SSRF
     * protection for an LLM-controlled URL.
     */
    private boolean blockPrivateAddresses = true;

    /**
     * Exact hosts (or {@code .suffix} / {@code *.suffix} patterns) that bypass
     * {@link #blockPrivateAddresses}. Keep this empty unless an internal
     * host must be reachable on purpose.
     */
    private List<String> allowedHosts = new ArrayList<>();

    /**
     * Maximum length of the stored file name. Longer names are truncated while
     * keeping the extension.
     */
    private int maxFileNameLength = 200;

    /**
     * Default User-Agent string. Used as fallback when UA rotation is disabled
     * or when a single consistent UA is needed.
     */
    private String userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    /**
     * Rotate realistic browser User-Agent values between requests/attempts.
     */
    private boolean userAgentRotation = true;

    /**
     * Directory used for the temporary file while streaming a download.
     * Empty means {@code java.io.tmpdir}.
     */
    private String tempDir = "";
}
