package com.knowledge.filecenter.skill;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Data;

/**
 * Configuration properties for the Web Resource skill.
 *
 * <p>
 * Controls the web search provider settings and download behavior.
 * Reuses the same provider types as the built-in WebSearchSkill:
 * tavily, duckduckgo, searxng, custom.
 *
 * <p>
 * Example configuration:
 * 
 * <pre>
 * agent:
 *   skill:
 *     web-resource:
 *       enabled: true
 *       api-url: https://api.tavily.com/search
 *       api-key: your-api-key
 *       provider: tavily
 *       timeout-seconds: 15
 *       default-max-results: 5
 *       max-download-size: 52428800
 *       user-agent: Mozilla/5.0 (compatible; KnowledgeAgent/1.0)
 * </pre>
 */
@Data
@Component
@ConfigurationProperties(prefix = "agent.skill.web-resource")
public class WebResourceProperties {

    /**
     * Whether the web resource skill is enabled.
     */
    private boolean enabled = true;

    /**
     * The search API URL. Defaults to Tavily Search API.
     * Can be set to DuckDuckGo, SearXNG instance, or other compatible search API.
     */
    private String apiUrl = "https://api.tavily.com/search";

    /**
     * API key for authenticated search APIs (e.g., Tavily).
     * Leave empty for APIs that don't require authentication.
     */
    private String apiKey = "";

    /**
     * Search provider type. Supported: "tavily", "duckduckgo", "searxng", "custom".
     */
    private String provider = "tavily";

    /**
     * HTTP request timeout in seconds.
     */
    private int timeoutSeconds = 15;

    /**
     * Default maximum number of search results to return.
     */
    private int defaultMaxResults = 5;

    /**
     * Maximum allowed search results (cap for user-provided maxResults parameter).
     */
    private int maxResultsLimit = 20;

    /**
     * Maximum file size to download in bytes (default 50MB).
     * Prevents downloading excessively large files.
     */
    private long maxDownloadSize = 52428800L;

    /**
     * User agent string for HTTP requests.
     * Defaults to a realistic Chrome User-Agent to avoid being blocked by servers
     * that reject bot-like user agents.
     */
    private String userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
}
