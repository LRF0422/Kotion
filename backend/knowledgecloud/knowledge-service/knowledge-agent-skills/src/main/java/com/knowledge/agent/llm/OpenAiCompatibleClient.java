package com.knowledge.agent.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.*;

/**
 * Generic OpenAI-compatible HTTP client.
 * Works with any provider that follows the OpenAI chat completions API format
 * (DeepSeek, OpenAI, Ollama, Zhipu GLM, etc.)
 *
 * Uses WebClient for reactive streaming.
 */
@Slf4j
public class OpenAiCompatibleClient implements LlmClient {

    private final String providerName;
    private final LlmClientFactory.ProviderConfig config;
    private final String chatPath;
    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    public OpenAiCompatibleClient(String providerName, LlmClientFactory.ProviderConfig config) {
        this.providerName = providerName;
        this.config = config;
        this.chatPath = config.getChatPath() != null && !config.getChatPath().isEmpty()
                ? config.getChatPath()
                : "/v1/chat/completions";
        this.objectMapper = new ObjectMapper();
        this.webClient = WebClient.builder()
                .baseUrl(config.getBaseUrl())
                .defaultHeader("Content-Type", "application/json")
                .defaultHeaders(headers -> {
                    String apiKey = config.getApiKey();
                    if (apiKey != null && !apiKey.isEmpty()) {
                        headers.set("Authorization", "Bearer " + apiKey);
                    }
                })
                .clientConnector(new org.springframework.http.client.reactive.ReactorClientHttpConnector(
                        reactor.netty.http.client.HttpClient.create()
                                .option(io.netty.channel.ChannelOption.CONNECT_TIMEOUT_MILLIS, 10_000)
                                .responseTimeout(java.time.Duration.ofMinutes(5))))
                .build();
    }

    /**
     * Provider API failure — carries the HTTP status so resilience layers can
     * classify retriability instead of string-matching messages.
     */
    public static class LlmApiException extends RuntimeException {
        public LlmApiException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    @Override
    public LlmResponse chat(LlmRequest request) {
        // Errors are PROPAGATED (never swallowed): callers (ResilientLlmAdapter)
        // rely on exceptions to trigger retry/backoff. A silent empty response
        // made retries and circuit-breaking dead code.
        String requestBody;
        try {
            requestBody = buildRequestBody(request, false);
        } catch (Exception e) {
            throw new LlmApiException("Failed to build LLM request: " + e.getMessage(), e);
        }
        String responseBody = webClient.post()
                .uri(chatPath)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(String.class)
                .onErrorMap(WebClientResponseException.class, e -> {
                    log.error("LLM chat API error ({} {}): {}", e.getStatusCode(),
                            e.getStatusText(), e.getResponseBodyAsString());
                    return new LlmApiException("LLM chat API error (" + e.getStatusCode()
                            + "): " + e.getResponseBodyAsString(), e);
                })
                .block();

        try {
            return parseResponse(responseBody);
        } catch (Exception e) {
            throw new LlmApiException("Failed to parse LLM response: " + e.getMessage(), e);
        }
    }

    @Override
    public Flux<StreamChunk> streamChat(LlmRequest request) {
        // Errors are PROPAGATED (never converted into done("error") chunks):
        // ResilientLlmAdapter's retryWhen must see the real exception to retry
        // 429/5xx/connection failures. Mid-stream failures surface to the
        // adapter, which decides between retry (pre-first-token) and surfacing
        // the error downstream (post-first-token).
        String requestBody;
        try {
            requestBody = buildRequestBody(request, true);
        } catch (Exception e) {
            return Flux.error(new LlmApiException("Failed to build LLM request: " + e.getMessage(), e));
        }
        return webClient.post()
                .uri(chatPath)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.TEXT_EVENT_STREAM)
                .bodyValue(requestBody)
                .retrieve()
                .bodyToFlux(String.class)
                .filter(line -> line != null && !line.isEmpty() && !"[DONE]".equals(line.trim()))
                .flatMap(this::parseStreamChunk)
                .onErrorMap(WebClientResponseException.class, e -> {
                    log.error("LLM stream API error for provider {} ({} {}): {}",
                            providerName, e.getStatusCode(), e.getStatusText(),
                            e.getResponseBodyAsString());
                    return new LlmApiException("LLM stream API error (" + e.getStatusCode()
                            + "): " + e.getResponseBodyAsString(), e);
                });
    }

    @Override
    public String getProviderName() {
        return providerName;
    }

    @Override
    public String getDefaultModel() {
        if (config.getModels().isEmpty()) {
            return "default";
        }
        return config.getModels().get(0).getName();
    }

    @Override
    public List<String> getAvailableModels() {
        return config.getModelNames();
    }

    // ---- Private helpers ----

    private String buildRequestBody(LlmRequest request, boolean stream) throws Exception {
        ObjectNode root = objectMapper.createObjectNode();
        String model = resolveModel(request.getModel());
        root.put("model", model);
        root.put("stream", stream);

        // >= 0: temperature=0 (deterministic) is a valid, meaningful value.
        if (request.getTemperature() >= 0) {
            root.put("temperature", request.getTemperature());
        }
        if (request.getMaxTokens() > 0) {
            root.put("max_tokens", request.getMaxTokens());
        }

        // Merge model-specific extra parameters from YAML config (e.g. Zhipu GLM's
        // "thinking" / "reasoning_effort"). These are provider extensions to the
        // OpenAI format and are applied before the standard fields below.
        ModelConfig modelConfig = config.getModelConfig(model);
        if (modelConfig != null && modelConfig.getExtra() != null) {
            for (Map.Entry<String, Object> entry : modelConfig.getExtra().entrySet()) {
                root.set(entry.getKey(), objectMapper.valueToTree(entry.getValue()));
            }
        }

        // Messages — filter out orphaned tool messages that would cause 400 errors.
        // A tool message must belong to a group that follows an assistant message
        // with tool_calls. Multiple tool messages may appear consecutively in the
        // same group (one per tool_call_id).
        //
        // Additionally, DeepSeek API requires that EVERY tool_call_id in an
        // assistant+tool_calls message has a corresponding tool result message.
        // If any are missing (e.g. due to truncation), we add placeholder tool
        // results to avoid a 400 error.
        ArrayNode messagesArray = root.putArray("messages");
        if (request.getMessages() != null) {
            // Pass 1: Filter orphaned tool messages into a validated list.
            List<com.knowledge.agent.api.dto.ChatMessage> validated = new ArrayList<>();
            boolean inToolCallGroup = false;
            for (com.knowledge.agent.api.dto.ChatMessage msg : request.getMessages()) {
                if ("tool".equals(msg.getRole())) {
                    if (!inToolCallGroup) {
                        log.warn(
                                "Skipping orphaned tool message (no preceding assistant+tool_calls): name={}, toolCallId={}",
                                msg.getName(), msg.getToolCallId());
                        continue;
                    }
                    // still inside the group — keep this message
                } else if ("assistant".equals(msg.getRole())
                        && msg.getToolCalls() != null && !msg.getToolCalls().isEmpty()) {
                    inToolCallGroup = true;
                } else {
                    inToolCallGroup = false;
                }
                validated.add(msg);
            }

            // Pass 2: Ensure every assistant+tool_calls message has a complete set
            // of tool result messages. If any tool_call_ids are missing their
            // corresponding tool result, add a placeholder tool result message.
            for (int i = 0; i < validated.size(); i++) {
                com.knowledge.agent.api.dto.ChatMessage msg = validated.get(i);
                if ("assistant".equals(msg.getRole())
                        && msg.getToolCalls() != null && !msg.getToolCalls().isEmpty()) {
                    // Collect expected tool_call_ids from the assistant message
                    Set<String> expectedIds = new LinkedHashSet<>();
                    for (com.knowledge.agent.api.dto.ChatMessage.ToolCallInfo tc : msg.getToolCalls()) {
                        if (tc.getId() != null) {
                            expectedIds.add(tc.getId());
                        }
                    }

                    // Collect tool_call_ids from subsequent tool messages in this group
                    Set<String> foundIds = new HashSet<>();
                    int j = i + 1;
                    while (j < validated.size() && "tool".equals(validated.get(j).getRole())) {
                        com.knowledge.agent.api.dto.ChatMessage toolMsg = validated.get(j);
                        if (toolMsg.getToolCallId() != null) {
                            foundIds.add(toolMsg.getToolCallId());
                        }
                        j++;
                    }

                    // Add placeholder tool results for any missing tool_call_ids
                    Set<String> missingIds = new LinkedHashSet<>(expectedIds);
                    missingIds.removeAll(foundIds);
                    for (String missingId : missingIds) {
                        log.warn("Adding placeholder tool result for missing tool_call_id: {}", missingId);
                        com.knowledge.agent.api.dto.ChatMessage placeholder = com.knowledge.agent.api.dto.ChatMessage
                                .builder()
                                .role("tool")
                                .toolCallId(missingId)
                                .content("")
                                .build();
                        validated.add(j, placeholder);
                        j++; // adjust index after insertion
                    }
                }
            }

            // Pass 3: Serialize validated messages to JSON
            for (com.knowledge.agent.api.dto.ChatMessage msg : validated) {
                ObjectNode msgNode = messagesArray.addObject();
                msgNode.put("role", msg.getRole());

                // DeepSeek API requires the "content" field to be present on all messages.
                // For assistant messages with tool_calls, content can be null but must
                // still be included, otherwise the API returns 400 Bad Request.
                if (msg.getContent() != null) {
                    msgNode.put("content", msg.getContent());
                } else if ("assistant".equals(msg.getRole()) && msg.getToolCalls() != null) {
                    msgNode.putNull("content");
                } else if ("tool".equals(msg.getRole())) {
                    // tool messages also need content
                    msgNode.put("content", "");
                }

                // Include reasoning_content for assistant messages (DeepSeek thinking mode).
                // When tool_calls are present, DeepSeek requires reasoning_content to be
                // passed back in all subsequent requests.
                if ("assistant".equals(msg.getRole()) && msg.getReasoningContent() != null
                        && !msg.getReasoningContent().isEmpty()) {
                    msgNode.put("reasoning_content", msg.getReasoningContent());
                }

                // Handle tool calls in assistant messages
                if ("assistant".equals(msg.getRole()) && msg.getToolCalls() != null) {
                    ArrayNode toolCallsArray = msgNode.putArray("tool_calls");
                    for (com.knowledge.agent.api.dto.ChatMessage.ToolCallInfo tc : msg.getToolCalls()) {
                        ObjectNode tcNode = toolCallsArray.addObject();
                        tcNode.put("id", tc.getId());
                        tcNode.put("type", tc.getType() != null ? tc.getType() : "function");
                        ObjectNode fnNode = tcNode.putObject("function");
                        fnNode.put("name", tc.getFunction().getName());
                        fnNode.put("arguments", tc.getFunction().getArguments());
                    }
                }
                // Handle tool responses
                if ("tool".equals(msg.getRole())) {
                    if (msg.getToolCallId() != null) {
                        msgNode.put("tool_call_id", msg.getToolCallId());
                    }
                    if (msg.getName() != null) {
                        msgNode.put("name", msg.getName());
                    }
                }
            }
        }

        // Tools
        boolean hasTools = false;
        if (request.getToolsJson() != null && !request.getToolsJson().isEmpty()) {
            JsonNode toolsNode = objectMapper.readTree(request.getToolsJson());
            if (toolsNode.isArray() && !toolsNode.isEmpty()) {
                root.set("tools", toolsNode);
                hasTools = true;
            }
        }

        // Tool choice — only include when tools are present.
        // DeepSeek API returns 400 if tool_choice is sent without tools.
        if (hasTools && request.getToolChoice() != null) {
            if ("auto".equals(request.getToolChoice())) {
                root.put("tool_choice", "auto");
            } else if ("none".equals(request.getToolChoice()) || "required".equals(request.getToolChoice())) {
                root.put("tool_choice", request.getToolChoice());
            } else {
                // Specific function name
                ObjectNode toolChoiceNode = root.putObject("tool_choice");
                toolChoiceNode.put("type", "function");
                toolChoiceNode.putObject("function").put("name", request.getToolChoice());
            }
        }

        String body = objectMapper.writeValueAsString(root);
        log.debug("LLM request body for {}: {}", providerName, body);
        return body;
    }

    private String resolveModel(String requestedModel) {
        if (requestedModel != null && !requestedModel.isEmpty()) {
            // Strip provider prefix if present
            if (requestedModel.contains("/")) {
                return requestedModel.split("/", 2)[1];
            }
            return requestedModel;
        }
        return getDefaultModel();
    }

    private LlmResponse parseResponse(String responseBody) throws Exception {
        JsonNode root = objectMapper.readTree(responseBody);
        JsonNode choices = root.get("choices");
        LlmResponse.LlmResponseBuilder builder = LlmResponse.builder();

        if (choices != null && choices.size() > 0) {
            JsonNode choice = choices.get(0);
            JsonNode message = choice.get("message");

            if (message != null) {
                JsonNode content = message.get("content");
                builder.content(content != null ? content.asText() : "");

                // Reasoning content (DeepSeek thinking mode)
                JsonNode reasoningContent = message.get("reasoning_content");
                if (reasoningContent != null && !reasoningContent.isNull()) {
                    builder.reasoningContent(reasoningContent.asText());
                }

                // Parse tool calls
                JsonNode toolCalls = message.get("tool_calls");
                if (toolCalls != null && toolCalls.isArray()) {
                    List<LlmResponse.ToolCall> calls = new ArrayList<>();
                    for (JsonNode tc : toolCalls) {
                        String id = tc.has("id") ? tc.get("id").asText() : "";
                        JsonNode fn = tc.get("function");
                        String name = fn != null && fn.has("name") ? fn.get("name").asText() : "";
                        String args = fn != null && fn.has("arguments") ? fn.get("arguments").asText() : "{}";
                        calls.add(LlmResponse.ToolCall.builder()
                                .id(id).name(name).arguments(args).build());
                    }
                    builder.toolCalls(calls);
                }
            }

            JsonNode finishReason = choice.get("finish_reason");
            builder.finishReason(finishReason != null ? finishReason.asText() : "stop");
        }

        // Usage — including the provider's context-cache accounting
        // (prompt_cache_hit_tokens / prompt_cache_miss_tokens), the direct
        // signal for how many prompt tokens were served from cache.
        JsonNode usage = root.get("usage");
        if (usage != null) {
            builder.usage(LlmResponse.Usage.builder()
                    .promptTokens(usage.has("prompt_tokens") ? usage.get("prompt_tokens").asInt() : 0)
                    .completionTokens(usage.has("completion_tokens") ? usage.get("completion_tokens").asInt() : 0)
                    .totalTokens(usage.has("total_tokens") ? usage.get("total_tokens").asInt() : 0)
                    .promptCacheHitTokens(cacheHitTokens(usage))
                    .promptCacheMissTokens(cacheMissTokens(usage))
                    .build());
        } else {
            builder.usage(LlmResponse.Usage.builder().build());
        }

        return builder.build();
    }

    private Flux<StreamChunk> parseStreamChunk(String line) {
        try {
            // Handle "data: " prefix from SSE
            String json = line.trim();
            if (json.startsWith("data: ")) {
                json = json.substring(6).trim();
            }
            if (json.isEmpty() || "[DONE]".equals(json)) {
                return Flux.empty();
            }

            JsonNode root = objectMapper.readTree(json);
            JsonNode choices = root.get("choices");
            if (choices == null || choices.size() == 0) {
                return Flux.empty();
            }

            JsonNode choice = choices.get(0);
            List<StreamChunk> chunks = new ArrayList<>();

            // Content delta
            JsonNode delta = choice.get("delta");
            if (delta != null) {
                // Reasoning content delta (DeepSeek thinking mode)
                JsonNode reasoningContent = delta.get("reasoning_content");
                if (reasoningContent != null && !reasoningContent.isNull() && !reasoningContent.asText().isEmpty()) {
                    chunks.add(StreamChunk.reasoningContent(reasoningContent.asText()));
                }

                JsonNode content = delta.get("content");
                if (content != null && !content.isNull() && !content.asText().isEmpty()) {
                    chunks.add(StreamChunk.content(content.asText()));
                }

                // Tool call deltas
                JsonNode toolCalls = delta.get("tool_calls");
                if (toolCalls != null && toolCalls.isArray()) {
                    for (JsonNode tc : toolCalls) {
                        String id = tc.has("id") ? tc.get("id").asText() : null;
                        Integer index = tc.has("index") ? tc.get("index").asInt() : null;
                        JsonNode fn = tc.get("function");
                        String name = fn != null && fn.has("name") ? fn.get("name").asText() : null;
                        String argsDelta = fn != null && fn.has("arguments") ? fn.get("arguments").asText() : null;

                        if (id != null || name != null || argsDelta != null) {
                            chunks.add(StreamChunk.toolCall(id, name, argsDelta, index));
                        }
                    }
                }
            }

            // Finish reason
            JsonNode finishReason = choice.get("finish_reason");
            if (finishReason != null && !finishReason.isNull()) {
                String reason = finishReason.asText();
                if (!reason.isEmpty() && !"null".equals(reason)) {
                    // Get usage from the final chunk
                    LlmResponse.Usage usage = LlmResponse.Usage.builder().build();
                    JsonNode usageNode = root.get("usage");
                    if (usageNode != null) {
                        usage = LlmResponse.Usage.builder()
                                .promptTokens(
                                        usageNode.has("prompt_tokens") ? usageNode.get("prompt_tokens").asInt() : 0)
                                .completionTokens(
                                        usageNode.has("completion_tokens") ? usageNode.get("completion_tokens").asInt()
                                                : 0)
                                .totalTokens(usageNode.has("total_tokens") ? usageNode.get("total_tokens").asInt() : 0)
                                .promptCacheHitTokens(cacheHitTokens(usageNode))
                                .promptCacheMissTokens(cacheMissTokens(usageNode))
                                .build();
                    }
                    chunks.add(StreamChunk.done(reason, usage));
                }
            }

            return Flux.fromIterable(chunks);
        } catch (Exception e) {
            log.warn("Failed to parse stream chunk: {}", line, e);
            return Flux.empty();
        }
    }

    /**
     * Prompt tokens served from the provider's context cache. DeepSeek reports
     * {@code prompt_cache_hit_tokens} at the top level; other OpenAI-compatible
     * providers nest the same signal under
     * {@code prompt_tokens_details.cached_tokens}.
     */
    private static int cacheHitTokens(JsonNode usage) {
        if (usage.has("prompt_cache_hit_tokens")) {
            return usage.get("prompt_cache_hit_tokens").asInt();
        }
        JsonNode details = usage.get("prompt_tokens_details");
        if (details != null && details.has("cached_tokens")) {
            return details.get("cached_tokens").asInt();
        }
        return 0;
    }

    /** Prompt tokens that missed the cache — derived when not reported. */
    private static int cacheMissTokens(JsonNode usage) {
        if (usage.has("prompt_cache_miss_tokens")) {
            return usage.get("prompt_cache_miss_tokens").asInt();
        }
        int prompt = usage.has("prompt_tokens") ? usage.get("prompt_tokens").asInt() : 0;
        return Math.max(0, prompt - cacheHitTokens(usage));
    }
}
