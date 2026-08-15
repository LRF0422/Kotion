package com.knowledge.agent.tool.builtin.web;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.tool.*;
import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URLEncoder;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Tool for web search with multi-provider support.
 * Supported providers: tavily, duckduckgo, searxng, custom.
 */
@Slf4j
@Component
public class WebSearchTool implements Tool {

    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${agent.skill.web-search.enabled:true}")
    private boolean enabled;

    @Value("${agent.skill.web-search.provider:tavily}")
    private String provider;

    @Value("${agent.skill.web-search.api-url:https://api.tavily.com/search}")
    private String apiUrl;

    @Value("${agent.skill.web-search.api-key:}")
    private String apiKey;

    @Value("${agent.skill.web-search.timeout-seconds:10}")
    private int timeoutSeconds;

    @Value("${agent.skill.web-search.default-max-results:5}")
    private int defaultMaxResults;

    @Value("${agent.skill.web-search.max-results-limit:20}")
    private int maxResultsLimit;

    @Override
    public String getId() {
        return "web_search";
    }
    @Override
    public boolean isReadOnly() {
        return true;
    }

    @Override
    public String getDescription() {
        return "Search the web for information. Returns search results with titles, URLs, and snippets.";
    }

    @Override
    public String getJsonSchema() {
        return ToolDefinition.objectSchema(
                new LinkedHashMap<String, ToolDefinition.PropertyDef>() {
                    {
                        put("query", ToolDefinition.PropertyDef.string("The search query"));
                        put("maxResults", ToolDefinition.PropertyDef.number("Maximum number of results (default: 5)"));
                    }
                },
                Collections.singletonList("query"));
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        if (!enabled) {
            return ToolResult.error("Web search is disabled");
        }
        log.info("WebSearchTool called with args: {}", args);

        try {
            JsonNode root = objectMapper.readTree(args);
            String query = root.has("query") ? root.get("query").asText() : null;
            if (StrUtil.isBlank(query)) {
                return ToolResult.error("Missing required parameter: query");
            }

            int maxResults = root.has("maxResults") ? root.get("maxResults").asInt(defaultMaxResults)
                    : defaultMaxResults;
            maxResults = Math.min(maxResults, maxResultsLimit);

            List<SearchResult> results = performSearch(query, maxResults);

            // Format results as markdown
            StringBuilder sb = new StringBuilder();
            sb.append("# Web Search Results\n\n");
            sb.append("**Query:** ").append(query).append("\n");
            sb.append("**Results:** ").append(results.size()).append("\n\n");

            for (int i = 0; i < results.size(); i++) {
                SearchResult r = results.get(i);
                sb.append(i + 1).append(". **").append(r.title).append("**\n");
                sb.append("   - URL: ").append(r.url).append("\n");
                if (StrUtil.isNotBlank(r.snippet)) {
                    sb.append("   - Snippet: ").append(r.snippet).append("\n");
                }
                sb.append("\n");
            }

            log.info("WebSearchTool returned {} results for query: '{}'", results.size(), query);
            return ToolResult.success(sb.toString());

        } catch (Exception e) {
            log.error("WebSearchTool error: {}", e.getMessage(), e);
            return ToolResult.error("Web search error: " + e.getMessage());
        }
    }

    // =========================================================================
    // Provider dispatch
    // =========================================================================

    private List<SearchResult> performSearch(String query, int maxResults) throws Exception {
        String p = provider.toLowerCase();
        switch (p) {
            case "tavily":
                return searchWithTavily(query, maxResults);
            case "duckduckgo":
                return searchWithDuckDuckGo(query, maxResults);
            case "searxng":
                return searchWithSearXNG(query, maxResults);
            case "custom":
                return searchWithCustomApi(query, maxResults);
            default:
                return searchWithTavily(query, maxResults);
        }
    }

    // =========================================================================
    // Tavily
    // =========================================================================

    @SuppressWarnings("unchecked")
    private List<SearchResult> searchWithTavily(String query, int maxResults) throws Exception {
        Map<String, Object> requestMap = new HashMap<>();
        requestMap.put("query", query);
        requestMap.put("api_key", apiKey);
        requestMap.put("max_results", maxResults);
        requestMap.put("include_answer", false);

        String requestJson = objectMapper.writeValueAsString(requestMap);

        try (HttpResponse response = HttpRequest.post(apiUrl)
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .header("User-Agent", USER_AGENT)
                .timeout(timeoutSeconds * 1000)
                .body(requestJson)
                .execute()) {

            if (!response.isOk()) {
                throw new RuntimeException("Tavily search failed with status: " + response.getStatus());
            }
            return parseTavilyJson(response.body(), maxResults);
        }
    }

    @SuppressWarnings("unchecked")
    private List<SearchResult> parseTavilyJson(String json, int maxResults) {
        List<SearchResult> results = new ArrayList<>();
        try {
            Map<String, Object> responseMap = objectMapper.readValue(json, Map.class);
            List<Map<String, Object>> items = (List<Map<String, Object>>) responseMap.get("results");
            if (items != null) {
                for (int i = 0; i < items.size() && i < maxResults; i++) {
                    Map<String, Object> item = items.get(i);
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

    // =========================================================================
    // DuckDuckGo
    // =========================================================================

    private List<SearchResult> searchWithDuckDuckGo(String query, int maxResults) throws Exception {
        String ddgUrl = StrUtil.isNotBlank(apiUrl) && !apiUrl.contains("tavily")
                ? apiUrl
                : "https://html.duckduckgo.com/html/";

        try (HttpResponse response = HttpRequest.post(ddgUrl)
                .header("User-Agent", USER_AGENT)
                .timeout(timeoutSeconds * 1000)
                .form("q", query)
                .form("b", "")
                .form("kl", "")
                .execute()) {

            if (!response.isOk()) {
                throw new RuntimeException("DuckDuckGo search failed with status: " + response.getStatus());
            }
            return parseDuckDuckGoHtml(response.body(), maxResults);
        }
    }

    private List<SearchResult> parseDuckDuckGoHtml(String html, int maxResults) {
        List<SearchResult> results = new ArrayList<>();

        Pattern resultPattern = Pattern.compile(
                "<a[^>]+class=\"result__a\"[^>]+href=\"([^\"]+)\"[^>]*>([^<]+)</a>"
                        + ".*?"
                        + "<a[^>]+class=\"result__snippet\"[^>]*>([^<]*(?:<[^>]+>[^<]*)*)</a>",
                Pattern.DOTALL | Pattern.CASE_INSENSITIVE);

        Matcher matcher = resultPattern.matcher(html);
        while (matcher.find() && results.size() < maxResults) {
            String url = decodeDdgUrl(matcher.group(1));
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

    // =========================================================================
    // SearXNG
    // =========================================================================

    @SuppressWarnings("unchecked")
    private List<SearchResult> searchWithSearXNG(String query, int maxResults) throws Exception {
        String url = apiUrl + "?q=" + URLEncoder.encode(query, "UTF-8")
                + "&format=json&pageno=1";

        HttpRequest request = HttpRequest.get(url)
                .header("User-Agent", USER_AGENT)
                .timeout(timeoutSeconds * 1000);

        if (StrUtil.isNotBlank(apiKey)) {
            request.header("Authorization", "Bearer " + apiKey);
        }

        try (HttpResponse response = request.execute()) {
            if (!response.isOk()) {
                throw new RuntimeException("SearXNG search failed with status: " + response.getStatus());
            }
            return parseSearXNGJson(response.body(), maxResults);
        }
    }

    @SuppressWarnings("unchecked")
    private List<SearchResult> parseSearXNGJson(String json, int maxResults) {
        List<SearchResult> results = new ArrayList<>();
        try {
            Map<String, Object> responseMap = objectMapper.readValue(json, Map.class);
            List<Map<String, Object>> items = (List<Map<String, Object>>) responseMap.get("results");
            if (items != null) {
                for (int i = 0; i < items.size() && i < maxResults; i++) {
                    Map<String, Object> item = items.get(i);
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

    // =========================================================================
    // Custom API
    // =========================================================================

    @SuppressWarnings("unchecked")
    private List<SearchResult> searchWithCustomApi(String query, int maxResults) throws Exception {
        String url = apiUrl;
        if (url.contains("?")) {
            url += "&q=" + URLEncoder.encode(query, "UTF-8");
        } else {
            url += "?q=" + URLEncoder.encode(query, "UTF-8");
        }
        url += "&max=" + maxResults;

        HttpRequest request = HttpRequest.get(url)
                .header("User-Agent", USER_AGENT)
                .timeout(timeoutSeconds * 1000);

        if (StrUtil.isNotBlank(apiKey)) {
            request.header("Authorization", "Bearer " + apiKey);
        }

        try (HttpResponse response = request.execute()) {
            if (!response.isOk()) {
                throw new RuntimeException("Custom search API failed with status: " + response.getStatus());
            }

            String json = response.body();
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
    // Helpers
    // =========================================================================

    private String decodeDdgUrl(String url) {
        if (url == null) {
            return null;
        }
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

    private static class SearchResult {
        final String title;
        final String url;
        final String snippet;

        SearchResult(String title, String url, String snippet) {
            this.title = title;
            this.url = url;
            this.snippet = snippet;
        }
    }
}
