package com.knowledge.agent.tool.builtin.web;

import cn.hutool.core.codec.Base64;
import cn.hutool.core.util.StrUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolDefinition;
import com.knowledge.agent.tool.ToolResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * Tool for searching curated public datasets on the web.
 * Supported providers: huggingface (default), kaggle, datagov (CKAN).
 * Returns dataset metadata (title, source, description, download URL) that can
 * be fed into {@code web_fetch} or the file-center download skill.
 */
@Slf4j
@Component
public class DatasetSearchTool implements Tool {

    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${agent.skill.dataset-search.enabled:true}")
    private boolean enabled;

    @Value("${agent.skill.dataset-search.provider:huggingface}")
    private String defaultProvider;

    @Value("${agent.skill.dataset-search.timeout-seconds:15}")
    private int timeoutSeconds;

    @Value("${agent.skill.dataset-search.default-max-results:5}")
    private int defaultMaxResults;

    @Value("${agent.skill.dataset-search.max-results-limit:20}")
    private int maxResultsLimit;

    @Value("${agent.skill.dataset-search.huggingface.api-url:https://huggingface.co/api/datasets}")
    private String huggingfaceApiUrl;

    @Value("${agent.skill.dataset-search.kaggle.api-url:https://www.kaggle.com/api/v1/datasets/list}")
    private String kaggleApiUrl;

    @Value("${agent.skill.dataset-search.kaggle.username:}")
    private String kaggleUsername;

    @Value("${agent.skill.dataset-search.kaggle.api-key:}")
    private String kaggleApiKey;

    @Value("${agent.skill.dataset-search.datagov.api-url:https://catalog.data.gov/api/3/action/package_search}")
    private String datagovApiUrl;

    @Override
    public String getId() {
        return "dataset_search";
    }

    @Override
    public boolean isReadOnly() {
        return true;
    }

    @Override
    public String getDescription() {
        return "Search curated public datasets from open data hubs (HuggingFace, Kaggle, data.gov). "
                + "Use this when the user asks for pre-curated datasets rather than arbitrary web pages. "
                + "Returns dataset metadata including title, source, description, and download/landing URL.";
    }

    @Override
    public String getJsonSchema() {
        LinkedHashMap<String, ToolDefinition.PropertyDef> props = new LinkedHashMap<>();
        props.put("query", ToolDefinition.PropertyDef.string("The dataset topic or keywords to search for"));
        props.put("provider", ToolDefinition.PropertyDef.string(
                "Dataset hub to search. Defaults to huggingface.",
                "huggingface", "kaggle", "datagov"));
        props.put("maxResults", ToolDefinition.PropertyDef.number("Maximum number of datasets to return (default: 5)"));
        return ToolDefinition.objectSchema(props, Collections.singletonList("query"));
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        if (!enabled) {
            return ToolResult.error("Dataset search is disabled");
        }
        log.info("DatasetSearchTool called with args: {}", args);

        try {
            JsonNode root = objectMapper.readTree(args);
            String query = root.has("query") ? root.get("query").asText() : null;
            if (StrUtil.isBlank(query)) {
                return ToolResult.error("Missing required parameter: query");
            }

            String provider = root.has("provider") && !root.get("provider").isNull()
                    ? root.get("provider").asText(defaultProvider)
                    : defaultProvider;
            if (StrUtil.isBlank(provider)) {
                provider = defaultProvider;
            }

            int maxResults = root.has("maxResults") ? root.get("maxResults").asInt(defaultMaxResults)
                    : defaultMaxResults;
            maxResults = Math.max(1, Math.min(maxResults, maxResultsLimit));

            List<DatasetHit> hits = performSearch(provider.toLowerCase(), query, maxResults);

            StringBuilder sb = new StringBuilder();
            sb.append("# Dataset Search Results\n\n");
            sb.append("**Query:** ").append(query).append("\n");
            sb.append("**Provider:** ").append(provider).append("\n");
            sb.append("**Results:** ").append(hits.size()).append("\n\n");

            for (int i = 0; i < hits.size(); i++) {
                DatasetHit h = hits.get(i);
                sb.append(i + 1).append(". **").append(safe(h.title)).append("**\n");
                sb.append("   - Source: ").append(safe(h.source)).append("\n");
                sb.append("   - URL: ").append(safe(h.url)).append("\n");
                if (StrUtil.isNotBlank(h.downloadUrl) && !h.downloadUrl.equals(h.url)) {
                    sb.append("   - Download: ").append(h.downloadUrl).append("\n");
                }
                if (StrUtil.isNotBlank(h.license)) {
                    sb.append("   - License: ").append(h.license).append("\n");
                }
                if (StrUtil.isNotBlank(h.size)) {
                    sb.append("   - Size: ").append(h.size).append("\n");
                }
                if (StrUtil.isNotBlank(h.description)) {
                    sb.append("   - Description: ").append(trim(h.description, 300)).append("\n");
                }
                sb.append("\n");
            }

            log.info("DatasetSearchTool returned {} results for query '{}' via {}", hits.size(), query, provider);
            return ToolResult.success(sb.toString());
        } catch (Exception e) {
            log.error("DatasetSearchTool error: {}", e.getMessage(), e);
            return ToolResult.error("Dataset search error: " + e.getMessage());
        }
    }

    // =========================================================================
    // Provider dispatch
    // =========================================================================

    private List<DatasetHit> performSearch(String provider, String query, int maxResults) throws Exception {
        switch (provider) {
            case "kaggle":
                return searchKaggle(query, maxResults);
            case "datagov":
                return searchDataGov(query, maxResults);
            case "huggingface":
            default:
                return searchHuggingFace(query, maxResults);
        }
    }

    // =========================================================================
    // HuggingFace Datasets
    // =========================================================================

    private List<DatasetHit> searchHuggingFace(String query, int maxResults) throws Exception {
        String url = huggingfaceApiUrl
                + "?search=" + URLEncoder.encode(query, "UTF-8")
                + "&limit=" + maxResults
                + "&full=true";

        try (HttpResponse response = HttpRequest.get(url)
                .header("User-Agent", USER_AGENT)
                .header("Accept", "application/json")
                .timeout(timeoutSeconds * 1000)
                .execute()) {
            if (!response.isOk()) {
                throw new RuntimeException("HuggingFace dataset search failed with status: " + response.getStatus());
            }
            JsonNode arr = objectMapper.readTree(response.body());
            List<DatasetHit> out = new ArrayList<>();
            if (arr.isArray()) {
                for (int i = 0; i < arr.size() && i < maxResults; i++) {
                    JsonNode item = arr.get(i);
                    String id = textOrEmpty(item, "id");
                    if (StrUtil.isBlank(id)) {
                        continue;
                    }
                    DatasetHit h = new DatasetHit();
                    h.title = id;
                    h.source = "HuggingFace";
                    h.url = "https://huggingface.co/datasets/" + id;
                    h.downloadUrl = "https://huggingface.co/api/datasets/" + id;
                    h.license = firstCardField(item, "license");
                    h.description = firstCardField(item, "description", "summary");
                    if (StrUtil.isBlank(h.description)) {
                        long downloads = item.path("downloads").asLong(-1);
                        long likes = item.path("likes").asLong(-1);
                        if (downloads >= 0 || likes >= 0) {
                            h.description = "downloads=" + (downloads < 0 ? "?" : downloads)
                                    + ", likes=" + (likes < 0 ? "?" : likes);
                        }
                    }
                    out.add(h);
                }
            }
            return out;
        }
    }

    private String firstCardField(JsonNode item, String... keys) {
        for (String k : keys) {
            String v = textOrEmpty(item, k);
            if (StrUtil.isNotBlank(v)) {
                return v;
            }
        }
        JsonNode card = item.path("cardData");
        if (card.isObject()) {
            for (String k : keys) {
                JsonNode node = card.path(k);
                if (node.isTextual()) {
                    return node.asText();
                }
                if (node.isArray() && node.size() > 0) {
                    return node.get(0).asText();
                }
            }
        }
        return null;
    }

    // =========================================================================
    // Kaggle Datasets
    // =========================================================================

    private List<DatasetHit> searchKaggle(String query, int maxResults) throws Exception {
        if (StrUtil.isBlank(kaggleUsername) || StrUtil.isBlank(kaggleApiKey)) {
            throw new RuntimeException(
                    "Kaggle credentials not configured. Set agent.skill.dataset-search.kaggle.username/api-key.");
        }
        String url = kaggleApiUrl + "?search=" + URLEncoder.encode(query, "UTF-8");
        String basic = Base64.encode((kaggleUsername + ":" + kaggleApiKey).getBytes("UTF-8"));

        try (HttpResponse response = HttpRequest.get(url)
                .header("User-Agent", USER_AGENT)
                .header("Accept", "application/json")
                .header("Authorization", "Basic " + basic)
                .timeout(timeoutSeconds * 1000)
                .execute()) {
            if (!response.isOk()) {
                throw new RuntimeException("Kaggle dataset search failed with status: " + response.getStatus());
            }
            JsonNode arr = objectMapper.readTree(response.body());
            List<DatasetHit> out = new ArrayList<>();
            if (arr.isArray()) {
                for (int i = 0; i < arr.size() && i < maxResults; i++) {
                    JsonNode item = arr.get(i);
                    String ref = textOrEmpty(item, "ref");
                    if (StrUtil.isBlank(ref)) {
                        continue;
                    }
                    DatasetHit h = new DatasetHit();
                    h.title = textOrDefault(item, "title", ref);
                    h.source = "Kaggle";
                    h.url = "https://www.kaggle.com/datasets/" + ref;
                    h.downloadUrl = "https://www.kaggle.com/api/v1/datasets/download/" + ref;
                    h.license = textOrEmpty(item, "licenseName");
                    long totalBytes = item.path("totalBytes").asLong(-1);
                    if (totalBytes > 0) {
                        h.size = humanBytes(totalBytes);
                    }
                    h.description = textOrEmpty(item, "subtitle");
                    if (StrUtil.isBlank(h.description)) {
                        h.description = textOrEmpty(item, "description");
                    }
                    out.add(h);
                }
            }
            return out;
        }
    }

    // =========================================================================
    // data.gov (CKAN)
    // =========================================================================

    private List<DatasetHit> searchDataGov(String query, int maxResults) throws Exception {
        String url = datagovApiUrl
                + "?q=" + URLEncoder.encode(query, "UTF-8")
                + "&rows=" + maxResults;

        try (HttpResponse response = HttpRequest.get(url)
                .header("User-Agent", USER_AGENT)
                .header("Accept", "application/json")
                .timeout(timeoutSeconds * 1000)
                .execute()) {
            if (!response.isOk()) {
                throw new RuntimeException("data.gov search failed with status: " + response.getStatus());
            }
            JsonNode root = objectMapper.readTree(response.body());
            JsonNode items = root.path("result").path("results");
            List<DatasetHit> out = new ArrayList<>();
            if (items.isArray()) {
                for (int i = 0; i < items.size() && i < maxResults; i++) {
                    JsonNode item = items.get(i);
                    String name = textOrEmpty(item, "name");
                    DatasetHit h = new DatasetHit();
                    h.title = textOrDefault(item, "title", name);
                    h.source = "data.gov";
                    h.url = StrUtil.isNotBlank(name) ? "https://catalog.data.gov/dataset/" + name : null;
                    h.license = textOrEmpty(item, "license_title");
                    h.description = textOrEmpty(item, "notes");
                    JsonNode resources = item.path("resources");
                    if (resources.isArray() && resources.size() > 0) {
                        JsonNode r0 = resources.get(0);
                        h.downloadUrl = textOrEmpty(r0, "url");
                    }
                    if (StrUtil.isNotBlank(h.url) || StrUtil.isNotBlank(h.downloadUrl)) {
                        out.add(h);
                    }
                }
            }
            return out;
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private static String textOrEmpty(JsonNode node, String field) {
        JsonNode n = node.path(field);
        return n.isTextual() ? n.asText() : (n.isMissingNode() || n.isNull() ? null : n.asText());
    }

    private static String textOrDefault(JsonNode node, String field, String fallback) {
        String v = textOrEmpty(node, field);
        return StrUtil.isBlank(v) ? fallback : v;
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }

    private static String trim(String s, int max) {
        if (s == null) {
            return "";
        }
        String cleaned = s.replaceAll("\\s+", " ").trim();
        return cleaned.length() > max ? cleaned.substring(0, max) + "..." : cleaned;
    }

    private static String humanBytes(long bytes) {
        String[] units = { "B", "KB", "MB", "GB", "TB" };
        double v = bytes;
        int i = 0;
        while (v >= 1024 && i < units.length - 1) {
            v /= 1024;
            i++;
        }
        return String.format("%.1f %s", v, units[i]);
    }

    // keep imports used (suppress warning for unused list helper)
    @SuppressWarnings("unused")
    private static List<String> asList(String... s) {
        return new ArrayList<>(Arrays.asList(s));
    }

    private static class DatasetHit {
        String title;
        String source;
        String url;
        String downloadUrl;
        String description;
        String license;
        String size;
    }
}
