package com.knowledge.filecenter.skill;

import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.core.agent.annotation.AgentSkill;
import com.knowledge.core.agent.annotation.SkillTierValue;
import com.knowledge.core.agent.annotation.SkillTool;
import com.knowledge.core.agent.annotation.ToolParam;
import com.knowledge.file.api.entity.enums.FileType;
import com.knowledge.filecenter.application.FileApplication;
import com.knowledge.filecenter.entity.KnowledgeFile;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;
import com.knowledge.filecenter.service.IFileService;

import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import lombok.extern.slf4j.Slf4j;

/**
 * Web Resource skill using annotation-based registration.
 * <p>
 * This skill provides the ability to search the web for resources and download
 * them directly into the file center. It combines web search and file download
 * capabilities into a single cohesive skill, enabling the agent to find
 * relevant materials online and save them to the knowledge base.
 * <p>
 * Tools provided:
 * <ul>
 * <li><b>search_web</b> - Search the web for resources related to a topic</li>
 * <li><b>search_and_download</b> - Search the web and download matching
 * resources in one step</li>
 * </ul>
 * <p>
 * For standalone file downloads, use the <b>download_file</b> tool provided by
 * WebDownloadSkill, which includes advanced anti-crawling protections
 * (User-Agent
 * rotation, cookie sessions, retry with backoff, HEAD pre-checks).
 *
 * <p>
 * Supported search providers:
 * <ul>
 * <li><b>tavily</b> - Tavily Search API (default, API key required)</li>
 * <li><b>duckduckgo</b> - DuckDuckGo HTML API (no API key required)</li>
 * <li><b>searxng</b> - SearXNG JSON API (self-hosted search)</li>
 * <li><b>custom</b> - Custom HTTP endpoint returning JSON results</li>
 * </ul>
 */
@Slf4j
@AgentSkill(id = "web-resource", name = "Web Resource", description = "Search the web for resources and download them to the file center. "
        + "Use this skill when you need to find documents, files, or reference materials online "
        + "and save them into the knowledge base. Can search the web or combine search and "
        + "download in one step. For standalone file downloads, use the download_file tool "
        + "from WebDownloadSkill.", version = "1.0.0", author = "KnowledgeCloud", tier = SkillTierValue.DOMAIN, categories = {
                "research", "file-management", "web", "information-retrieval" })
public class WebResourceSkill {

    private static final Pattern URL_PATTERN = Pattern.compile("^https?://.*", Pattern.CASE_INSENSITIVE);
    private static final Pattern FILE_EXTENSION_PATTERN = Pattern.compile("\\.([a-zA-Z0-9]+)(?:[?#].*)?$");

    /** Common document extensions that are typically downloadable files. */
    private static final List<String> DOWNLOADABLE_EXTENSIONS = Arrays.asList(
            "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
            "txt", "csv", "json", "xml", "zip", "rar", "7z",
            "jpg", "jpeg", "png", "gif", "svg", "webp",
            "mp3", "mp4", "avi", "mov", "wav",
            "html", "htm", "md", "rtf", "odt", "ods", "odp");

    @Autowired
    private WebResourceProperties properties;

    @Autowired
    private FileApplication fileApplication;

    @Autowired
    private IFileService fileService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // =========================================================================
    // Tool: search_web
    // =========================================================================

    /**
     * Search the web for resources related to a query.
     *
     * @param query      the search query string
     * @param maxResults maximum number of results to return
     * @return JSON array of search results with title, url, and snippet
     */
    @SkillTool(name = "search_web", description = "Search the web for resources related to a topic. "
            + "Returns a list of search results with titles, URLs, and snippets. "
            + "Use this to find relevant documents, articles, or downloadable files on the internet.")
    public String searchWeb(
            @ToolParam(name = "query", description = "The search query. Be specific and include relevant keywords for better results.", type = "string", required = true) String query,
            @ToolParam(name = "maxResults", description = "Maximum number of search results to return (default: 5, max: 20).", type = "number", required = false) Integer maxResults) {

        if (StrUtil.isBlank(query)) {
            return "Error: Missing required parameter: query";
        }

        if (!properties.isEnabled()) {
            return "Error: Web Resource skill is disabled. Enable it via configuration agent.skill.web-resource.enabled=true";
        }

        int effectiveMaxResults = maxResults != null ? maxResults : properties.getDefaultMaxResults();
        effectiveMaxResults = Math.min(effectiveMaxResults, properties.getMaxResultsLimit());

        log.info("WebResourceSkill searching: query='{}', maxResults={}, provider={}",
                query, effectiveMaxResults, properties.getProvider());

        try {
            List<SearchResult> results = performSearch(query, effectiveMaxResults);
            String jsonOutput = objectMapper.writeValueAsString(results);

            StringBuilder sb = new StringBuilder();
            sb.append("# Web Search Results\n\n");
            sb.append("**Query:** ").append(query).append("\n");
            sb.append("**Results:** ").append(results.size()).append("\n\n");

            for (int i = 0; i < results.size(); i++) {
                SearchResult r = results.get(i);
                sb.append(i + 1).append(". **").append(r.getTitle()).append("**\n");
                sb.append("   - URL: ").append(r.getUrl()).append("\n");
                if (StrUtil.isNotBlank(r.getSnippet())) {
                    sb.append("   - Snippet: ").append(r.getSnippet()).append("\n");
                }
                sb.append("\n");
            }

            log.info("WebResourceSkill returned {} results for query: '{}'", results.size(), query);
            return sb.toString();

        } catch (Exception e) {
            log.error("WebResourceSkill search error for query '{}': {}", query, e.getMessage(), e);
            return "Error searching the web: " + e.getMessage();
        }
    }

    // =========================================================================
    // Tool: search_and_download
    // =========================================================================

    /**
     * Search the web for resources and download matching ones to the file center.
     *
     * @param query            the search query
     * @param maxResults       maximum number of search results to consider
     * @param parentId         the parent folder ID to save files into
     * @param repositoryKey    the repository key
     * @param fileExtensions   comma-separated list of file extensions to filter
     *                         (e.g., "pdf,docx")
     * @param autoCreateFolder whether to auto-create a folder named after the query
     * @return summary of search results and downloads
     */
    @SkillTool(name = "search_and_download", description = "Search the web for resources and download matching files to the file center in one step. "
            + "Optionally filter by file extension (e.g., 'pdf,docx') to only download specific file types. "
            + "Can automatically create a folder named after the search query to organize the downloads. "
            + "Returns a summary of found results and successfully downloaded files.")
    public String searchAndDownload(
            @ToolParam(name = "query", description = "The search query to find resources on the web.", type = "string", required = true) String query,
            @ToolParam(name = "maxResults", description = "Maximum number of search results to consider for downloading (default: 3, max: 10).", type = "number", required = false) Integer maxResults,
            @ToolParam(name = "parentId", description = "The parent folder ID to save downloaded files into. Use 0 or null for root.", type = "number", required = false) Long parentId,
            @ToolParam(name = "repositoryKey", description = "The repository key. Leave empty to use the default repository.", type = "string", required = false) String repositoryKey,
            @ToolParam(name = "fileExtensions", description = "Comma-separated list of file extensions to filter downloads (e.g., 'pdf,docx,xlsx'). If not provided, attempts to download all result URLs that look like files.", type = "string", required = false) String fileExtensions,
            @ToolParam(name = "autoCreateFolder", description = "Whether to automatically create a folder named after the query to organize the downloads (default: true).", type = "boolean", required = false) Boolean autoCreateFolder) {

        if (StrUtil.isBlank(query)) {
            return "Error: Missing required parameter: query";
        }

        if (!properties.isEnabled()) {
            return "Error: Web Resource skill is disabled.";
        }

        int effectiveMaxResults = maxResults != null ? Math.min(maxResults, 10) : 3;
        boolean shouldCreateFolder = autoCreateFolder != null ? autoCreateFolder : true;
        List<String> extensionFilter = parseExtensionFilter(fileExtensions);

        log.info("WebResourceSkill search_and_download: query='{}', maxResults={}, extensions={}, autoCreateFolder={}",
                query, effectiveMaxResults, extensionFilter, shouldCreateFolder);

        try {
            // Step 1: Perform web search
            List<SearchResult> searchResults = performSearch(query, effectiveMaxResults);

            if (searchResults.isEmpty()) {
                return "# Search and Download Results\n\nNo results found for query: \"" + query + "\"";
            }

            // Step 2: Optionally create a folder for the downloads
            Long effectiveParentId = parentId;
            if (shouldCreateFolder && (effectiveParentId == null || effectiveParentId == 0L)) {
                String folderName = sanitizeFolderName(query);
                effectiveParentId = createFolderIfNeeded(folderName, repositoryKey);
            }

            // Step 3: Filter and download resources
            List<DownloadResult> downloadResults = new ArrayList<>();
            List<SearchResult> skippedResults = new ArrayList<>();

            for (SearchResult sr : searchResults) {
                String url = sr.getUrl();

                // Check if URL looks downloadable
                if (!isLikelyDownloadableUrl(url, extensionFilter)) {
                    skippedResults.add(sr);
                    continue;
                }

                try {
                    String derivedName = deriveFileNameFromUrl(url);
                    KnowledgeFileVO fileVO = fileApplication.downloadFromUrl(url, derivedName, effectiveParentId,
                            repositoryKey);

                    downloadResults.add(new DownloadResult(
                            sr.getTitle(), url, fileVO.getId(), fileVO.getName(),
                            fileVO.getSize() != null ? fileVO.getSize() : 0, true, null));
                } catch (Exception e) {
                    log.warn("Failed to download from '{}': {}", url, e.getMessage());
                    downloadResults.add(new DownloadResult(
                            sr.getTitle(), url, null, null, 0, false, e.getMessage()));
                }
            }

            // Step 4: Build result summary
            StringBuilder result = new StringBuilder();
            result.append("# Search and Download Results\n\n");
            result.append("**Query:** ").append(query).append("\n");
            result.append("**Search Results Found:** ").append(searchResults.size()).append("\n");

            if (effectiveParentId != null && effectiveParentId > 0) {
                result.append("**Target Folder ID:** ").append(effectiveParentId).append("\n");
            }

            long successCount = downloadResults.stream().filter(DownloadResult::isSuccess).count();
            result.append("**Successfully Downloaded:** ").append(successCount).append("\n");
            result.append("**Failed/Skipped:** ").append(downloadResults.size() - successCount + skippedResults.size())
                    .append("\n\n");

            // List successful downloads
            if (successCount > 0) {
                result.append("## Downloaded Files\n\n");
                for (DownloadResult dr : downloadResults) {
                    if (dr.isSuccess()) {
                        result.append("- **").append(dr.getFileName()).append("**\n");
                        result.append("  - File ID: ").append(dr.getFileId()).append("\n");
                        result.append("  - Size: ").append(dr.getFileSize()).append(" bytes\n");
                        result.append("  - Source: ").append(dr.getUrl()).append("\n\n");
                    }
                }
            }

            // List failed downloads
            List<DownloadResult> failedDownloads = downloadResults.stream()
                    .filter(d -> !d.isSuccess()).collect(Collectors.toList());
            if (!failedDownloads.isEmpty()) {
                result.append("## Failed Downloads\n\n");
                for (DownloadResult dr : failedDownloads) {
                    result.append("- **").append(dr.getTitle()).append("**\n");
                    result.append("  - URL: ").append(dr.getUrl()).append("\n");
                    result.append("  - Error: ").append(dr.getErrorMessage()).append("\n\n");
                }
            }

            // List skipped (non-downloadable) results for reference
            if (!skippedResults.isEmpty()) {
                result.append("## Skipped Results (Web Pages, Not Direct Files)\n\n");
                for (SearchResult sr : skippedResults) {
                    result.append("- **").append(sr.getTitle()).append("**\n");
                    result.append("  - URL: ").append(sr.getUrl()).append("\n");
                    if (StrUtil.isNotBlank(sr.getSnippet())) {
                        result.append("  - Snippet: ").append(sr.getSnippet()).append("\n");
                    }
                    result.append("\n");
                }
            }

            return result.toString();

        } catch (Exception e) {
            log.error("WebResourceSkill search_and_download error for query '{}': {}", query, e.getMessage(), e);
            return "Error in search and download: " + e.getMessage();
        }
    }

    // =========================================================================
    // Search Implementation
    // =========================================================================

    /**
     * Perform web search using the configured provider.
     */
    private List<SearchResult> performSearch(String query, int maxResults) throws Exception {
        String provider = properties.getProvider().toLowerCase();

        switch (provider) {
            case "tavily":
                return searchWithTavily(query, maxResults);
            case "searxng":
                return searchWithSearXNG(query, maxResults);
            case "duckduckgo":
                return searchWithDuckDuckGo(query, maxResults);
            case "custom":
                return searchWithCustomApi(query, maxResults);
            default:
                return searchWithTavily(query, maxResults);
        }
    }

    /**
     * Search using Tavily Search API.
     */
    @SuppressWarnings("unchecked")
    private List<SearchResult> searchWithTavily(String query, int maxResults) throws Exception {
        Map<String, Object> requestMap = new HashMap<>();
        requestMap.put("query", query);
        requestMap.put("api_key", properties.getApiKey());
        requestMap.put("max_results", maxResults);
        requestMap.put("include_answer", false);

        String requestJson = objectMapper.writeValueAsString(requestMap);

        try (HttpResponse response = HttpRequest.post(properties.getApiUrl())
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + properties.getApiKey())
                .header("User-Agent", properties.getUserAgent())
                .timeout(properties.getTimeoutSeconds() * 1000)
                .body(requestJson)
                .execute()) {

            if (!response.isOk()) {
                throw new RuntimeException("Tavily search failed with status: " + response.getStatus());
            }

            String json = response.body();
            return parseTavilyJson(json, maxResults);
        }
    }

    /**
     * Parse Tavily JSON response.
     */
    @SuppressWarnings("unchecked")
    private List<SearchResult> parseTavilyJson(String json, int maxResults) {
        List<SearchResult> results = new ArrayList<>();
        try {
            Map<String, Object> responseMap = objectMapper.readValue(json, Map.class);
            List<Map<String, Object>> searchResults = (List<Map<String, Object>>) responseMap.get("results");

            if (searchResults != null) {
                for (int i = 0; i < searchResults.size() && i < maxResults; i++) {
                    Map<String, Object> item = searchResults.get(i);
                    String title = (String) item.get("title");
                    String url = (String) item.get("url");
                    String snippet = (String) item.get("content");

                    if (url != null && !url.isEmpty()) {
                        results.add(new SearchResult(
                                title != null ? title : "",
                                url,
                                snippet != null ? snippet : ""));
                    }
                }
            }
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse Tavily JSON response: {}", e.getMessage());
        }
        return results;
    }

    /**
     * Search using DuckDuckGo HTML API.
     */
    private List<SearchResult> searchWithDuckDuckGo(String query, int maxResults) throws Exception {
        try (HttpResponse response = HttpRequest.post(properties.getApiUrl())
                .header("User-Agent", properties.getUserAgent())
                .timeout(properties.getTimeoutSeconds() * 1000)
                .form("q", query)
                .form("b", "")
                .form("kl", "")
                .execute()) {

            if (!response.isOk()) {
                throw new RuntimeException("DuckDuckGo search failed with status: " + response.getStatus());
            }

            String html = response.body();
            return parseDuckDuckGoHtml(html, maxResults);
        }
    }

    /**
     * Parse DuckDuckGo HTML response to extract search results.
     */
    private List<SearchResult> parseDuckDuckGoHtml(String html, int maxResults) {
        List<SearchResult> results = new ArrayList<>();

        // Pattern to match DuckDuckGo result blocks
        Pattern resultPattern = Pattern.compile(
                "<a[^>]+class=\"result__a\"[^>]+href=\"([^\"]+)\"[^>]*>([^<]+)</a>"
                        + ".*?"
                        + "<a[^>]+class=\"result__snippet\"[^>]*>([^<]*(?:<[^>]+>[^<]*)*)</a>",
                Pattern.DOTALL | Pattern.CASE_INSENSITIVE);

        Matcher matcher = resultPattern.matcher(html);
        while (matcher.find() && results.size() < maxResults) {
            String url = decodeUrl(matcher.group(1));
            String title = cleanHtml(matcher.group(2));
            String snippet = cleanHtml(matcher.group(3));

            if (url != null && !url.isEmpty() && title != null && !title.isEmpty()) {
                results.add(new SearchResult(title, url, snippet));
            }
        }

        // Fallback: simpler pattern
        if (results.isEmpty()) {
            Pattern simplePattern = Pattern.compile(
                    "<a[^>]+href=\"(https?://[^\"]+)\"[^>]*class=\"[^\"]*result[^\"]*\"[^>]*>([^<]+)</a>",
                    Pattern.CASE_INSENSITIVE);
            Matcher simpleMatcher = simplePattern.matcher(html);
            while (simpleMatcher.find() && results.size() < maxResults) {
                String url = simpleMatcher.group(1);
                String title = cleanHtml(simpleMatcher.group(2));
                results.add(new SearchResult(title, url, ""));
            }
        }

        return results;
    }

    /**
     * Search using SearXNG JSON API.
     */
    @SuppressWarnings("unchecked")
    private List<SearchResult> searchWithSearXNG(String query, int maxResults) throws Exception {
        String url = properties.getApiUrl() + "?q=" + URLEncoder.encode(query, "UTF-8")
                + "&format=json&pageno=1";

        HttpRequest request = HttpRequest.get(url)
                .header("User-Agent", properties.getUserAgent())
                .timeout(properties.getTimeoutSeconds() * 1000);

        if (StrUtil.isNotBlank(properties.getApiKey())) {
            request.header("Authorization", "Bearer " + properties.getApiKey());
        }

        try (HttpResponse response = request.execute()) {
            if (!response.isOk()) {
                throw new RuntimeException("SearXNG search failed with status: " + response.getStatus());
            }

            String json = response.body();
            return parseSearXNGJson(json, maxResults);
        }
    }

    /**
     * Parse SearXNG JSON response.
     */
    @SuppressWarnings("unchecked")
    private List<SearchResult> parseSearXNGJson(String json, int maxResults) {
        List<SearchResult> results = new ArrayList<>();
        try {
            Map<String, Object> responseMap = objectMapper.readValue(json, Map.class);
            List<Map<String, Object>> searchResults = (List<Map<String, Object>>) responseMap.get("results");

            if (searchResults != null) {
                for (int i = 0; i < searchResults.size() && i < maxResults; i++) {
                    Map<String, Object> item = searchResults.get(i);
                    String title = (String) item.get("title");
                    String url = (String) item.get("url");
                    String snippet = (String) item.get("content");

                    if (url != null && !url.isEmpty()) {
                        results.add(new SearchResult(
                                title != null ? title : "",
                                url,
                                snippet != null ? snippet : ""));
                    }
                }
            }
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse SearXNG JSON response: {}", e.getMessage());
        }
        return results;
    }

    /**
     * Search using a custom API endpoint.
     */
    @SuppressWarnings("unchecked")
    private List<SearchResult> searchWithCustomApi(String query, int maxResults) throws Exception {
        String url = properties.getApiUrl();
        if (url.contains("?")) {
            url += "&q=" + URLEncoder.encode(query, "UTF-8");
        } else {
            url += "?q=" + URLEncoder.encode(query, "UTF-8");
        }
        url += "&max=" + maxResults;

        HttpRequest request = HttpRequest.get(url)
                .header("User-Agent", properties.getUserAgent())
                .timeout(properties.getTimeoutSeconds() * 1000);

        if (StrUtil.isNotBlank(properties.getApiKey())) {
            request.header("Authorization", "Bearer " + properties.getApiKey());
        }

        try (HttpResponse response = request.execute()) {
            if (!response.isOk()) {
                throw new RuntimeException("Custom search API failed with status: " + response.getStatus());
            }

            String json = response.body();

            // Try parsing as array first
            List<Map<String, Object>> items;
            if (json.trim().startsWith("[")) {
                items = objectMapper.readValue(json, List.class);
            } else {
                Map<String, Object> responseMap = objectMapper.readValue(json, Map.class);
                items = (List<Map<String, Object>>) responseMap.get("results");
                if (items == null) {
                    items = (List<Map<String, Object>>) responseMap.get("items");
                }
            }

            List<SearchResult> results = new ArrayList<>();
            if (items != null) {
                for (int i = 0; i < items.size() && i < maxResults; i++) {
                    Map<String, Object> item = items.get(i);
                    String title = getFirstNonNull(item, "title", "name");
                    String itemUrl = getFirstNonNull(item, "url", "link", "href");
                    String snippet = getFirstNonNull(item, "snippet", "content", "description", "body");

                    if (itemUrl != null && !itemUrl.isEmpty()) {
                        results.add(new SearchResult(
                                title != null ? title : "",
                                itemUrl,
                                snippet != null ? snippet : ""));
                    }
                }
            }
            return results;
        }
    }

    // =========================================================================
    // Download Helpers
    // =========================================================================

    /**
     * Derive a file name from the URL path.
     */
    private String deriveFileNameFromUrl(String url) {
        try {
            String path = new URL(url).getPath();
            String fileName = path.substring(path.lastIndexOf('/') + 1);

            // Remove query parameters and fragments
            int queryIdx = fileName.indexOf('?');
            if (queryIdx > 0) {
                fileName = fileName.substring(0, queryIdx);
            }
            int fragmentIdx = fileName.indexOf('#');
            if (fragmentIdx > 0) {
                fileName = fileName.substring(0, fragmentIdx);
            }

            // URL decode
            fileName = java.net.URLDecoder.decode(fileName, "UTF-8");

            if (StrUtil.isBlank(fileName) || fileName.equals("/")) {
                fileName = "downloaded_resource";
            }

            return fileName;
        } catch (Exception e) {
            return "downloaded_resource";
        }
    }

    /**
     * Check if a URL looks like a downloadable file based on its extension.
     *
     * @param url             the URL to check
     * @param extensionFilter if non-empty, only URLs with these extensions are
     *                        considered downloadable
     * @return true if the URL appears to point to a downloadable file
     */
    private boolean isLikelyDownloadableUrl(String url, List<String> extensionFilter) {
        if (url == null) {
            return false;
        }

        String extension = extractExtensionFromUrl(url);

        // If specific extensions were requested, filter by them
        if (extensionFilter != null && !extensionFilter.isEmpty()) {
            return extension != null && extensionFilter.contains(extension.toLowerCase());
        }

        // If no filter, accept URLs that have a known downloadable extension
        if (extension != null && DOWNLOADABLE_EXTENSIONS.contains(extension.toLowerCase())) {
            return true;
        }

        // Also accept URLs that look like file downloads (have a file-like path)
        // even if extension is not in our list
        return extension != null && extension.length() <= 10 && extension.length() >= 2;
    }

    /**
     * Extract file extension from a URL.
     */
    private String extractExtensionFromUrl(String url) {
        Matcher matcher = FILE_EXTENSION_PATTERN.matcher(url);
        if (matcher.find()) {
            return matcher.group(1).toLowerCase();
        }
        return null;
    }

    /**
     * Parse a comma-separated extension filter string into a list.
     */
    private List<String> parseExtensionFilter(String fileExtensions) {
        if (StrUtil.isBlank(fileExtensions)) {
            return new ArrayList<>();
        }
        return Arrays.stream(fileExtensions.split(","))
                .map(String::trim)
                .map(String::toLowerCase)
                .filter(ext -> !ext.isEmpty())
                .collect(Collectors.toList());
    }

    /**
     * Create a folder in the file center if needed for organizing downloads.
     */
    private Long createFolderIfNeeded(String folderName, String repositoryKey) {
        try {
            com.knowledge.file.api.entity.dto.KnowledgeFileDTO dto = new com.knowledge.file.api.entity.dto.KnowledgeFileDTO();
            dto.setName(folderName);
            dto.setType(FileType.FOLDER);
            dto.setParentId(0L);
            dto.setRepositoryKey(repositoryKey);

            fileApplication.createFile(dto);

            // Find the created folder
            List<KnowledgeFile> folders = fileService.lambdaQuery()
                    .eq(KnowledgeFile::getName, folderName)
                    .eq(KnowledgeFile::getType, FileType.FOLDER)
                    .orderByDesc(KnowledgeFile::getCreateTime)
                    .last("LIMIT 1")
                    .list();

            if (!folders.isEmpty()) {
                log.info("Created folder '{}' with id={}", folderName, folders.get(0).getId());
                return folders.get(0).getId();
            }
        } catch (Exception e) {
            log.warn("Failed to create folder '{}': {}", folderName, e.getMessage());
        }
        return 0L;
    }

    /**
     * Sanitize a query string to be used as a folder name.
     */
    private String sanitizeFolderName(String query) {
        String name = query.trim();
        // Remove characters not suitable for folder names
        name = name.replaceAll("[\\\\/:*?\"<>|]", " ");
        // Normalize whitespace
        name = name.replaceAll("\\s+", " ").trim();
        // Limit length
        if (name.length() > 50) {
            name = name.substring(0, 50).trim();
        }
        return name;
    }

    // =========================================================================
    // HTML/URL Helpers
    // =========================================================================

    private String decodeUrl(String url) {
        if (url == null) {
            return null;
        }
        // DuckDuckGo wraps URLs in redirect, extract actual URL
        if (url.contains("uddg=")) {
            int start = url.indexOf("uddg=") + 5;
            int end = url.indexOf("&", start);
            String encoded = end > start ? url.substring(start, end) : url.substring(start);
            try {
                return java.net.URLDecoder.decode(encoded, "UTF-8");
            } catch (Exception e) {
                return url;
            }
        }
        return url;
    }

    private String cleanHtml(String text) {
        if (text == null) {
            return "";
        }
        String cleaned = text.replaceAll("<[^>]+>", " ");
        cleaned = cleaned.replace("&amp;", "&")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&nbsp;", " ");
        cleaned = cleaned.replaceAll("\\s+", " ").trim();
        return cleaned;
    }

    private String getFirstNonNull(Map<String, Object> map, String... keys) {
        for (String key : keys) {
            Object value = map.get(key);
            if (value != null) {
                return value.toString();
            }
        }
        return null;
    }

    // =========================================================================
    // Inner classes
    // =========================================================================

    /**
     * Represents a single web search result.
     */
    private static class SearchResult {
        private final String title;
        private final String url;
        private final String snippet;

        SearchResult(String title, String url, String snippet) {
            this.title = title;
            this.url = url;
            this.snippet = snippet;
        }

        public String getTitle() {
            return title;
        }

        public String getUrl() {
            return url;
        }

        public String getSnippet() {
            return snippet;
        }
    }

    /**
     * Represents the result of a download attempt.
     */
    private static class DownloadResult {
        private final String title;
        private final String url;
        private final Long fileId;
        private final String fileName;
        private final long fileSize;
        private final boolean success;
        private final String errorMessage;

        DownloadResult(String title, String url, Long fileId, String fileName,
                long fileSize, boolean success, String errorMessage) {
            this.title = title;
            this.url = url;
            this.fileId = fileId;
            this.fileName = fileName;
            this.fileSize = fileSize;
            this.success = success;
            this.errorMessage = errorMessage;
        }

        public String getTitle() {
            return title;
        }

        public String getUrl() {
            return url;
        }

        public Long getFileId() {
            return fileId;
        }

        public String getFileName() {
            return fileName;
        }

        public long getFileSize() {
            return fileSize;
        }

        public boolean isSuccess() {
            return success;
        }

        public String getErrorMessage() {
            return errorMessage;
        }
    }
}
