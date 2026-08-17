package com.knowledge.agentcore.tool.builtin;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agentcore.config.AgentCoreProperties;
import com.knowledge.agentcore.tool.BackendTool;
import com.knowledge.agentcore.tool.ToolContext;
import com.knowledge.agentcore.tool.ToolKind;
import com.knowledge.agentcore.tool.ToolSpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Web search tool (Tavily-compatible search API, configured under
 * {@code agent.skill.web-search}).
 */
@Slf4j
@Component
public class WebSearchTool implements BackendTool {

    private final AgentCoreProperties properties;
    private final ObjectMapper objectMapper;

    public WebSearchTool(AgentCoreProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    @Override
    public ToolSpec spec() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("query", Schemas.str("搜索关键词。"));
        props.put("maxResults", Schemas.integer("最大结果数，默认 5。"));
        return ToolSpec.of("web_search",
                "联网搜索，返回标题/链接/摘要列表。用于查找外部资料、最新信息。",
                Schemas.object(props, "query"), ToolKind.BACKEND, true, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        AgentCoreProperties.Skill.WebSearch config = properties.getSkill().getWebSearch();
        if (!config.isEnabled()) {
            throw new IllegalStateException("web_search 未启用");
        }
        String query = args.get("query") == null ? "" : String.valueOf(args.get("query"));
        if (query.trim().isEmpty()) {
            throw new IllegalArgumentException("query 不能为空");
        }
        int maxResults = args.get("maxResults") == null ? config.getDefaultMaxResults()
                : ((Number) args.get("maxResults")).intValue();
        maxResults = Math.max(1, Math.min(maxResults, config.getMaxResultsLimit()));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("api_key", config.getApiKey());
        body.put("query", query);
        body.put("max_results", maxResults);

        Map<String, Object> response;
        try {
            String json = WebClient.builder().build()
                    .post()
                    .uri(config.getApiUrl())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(config.getTimeoutSeconds()))
                    .block();
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = json == null ? new LinkedHashMap<>()
                    : objectMapper.readValue(json, Map.class);
            response = parsed;
        } catch (Exception e) {
            throw new IllegalStateException("搜索请求失败: " + e.getMessage(), e);
        }

        List<Map<String, Object>> results = new ArrayList<>();
        Object raw = response.get("results");
        if (raw instanceof List) {
            for (Object item : (List<?>) raw) {
                if (item instanceof Map) {
                    Map<?, ?> map = (Map<?, ?>) item;
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("title", map.get("title"));
                    entry.put("url", map.get("url"));
                    entry.put("content", map.get("content"));
                    results.add(entry);
                }
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("query", query);
        result.put("count", results.size());
        result.put("results", results);
        return result;
    }
}
