package com.knowledge.agent.api.provider;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.api.dto.ChatTool;
import com.knowledge.agent.api.dto.ChatFunction;
import lombok.extern.slf4j.Slf4j;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;
import reactor.core.scheduler.Schedulers;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * DeepSeek model provider implementation.
 */
@Slf4j
public class DeepSeekProvider implements ModelProvider {

    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    private static final String CHAT_PATH = "/v1/chat/completions";
    private static final String DONE_MARKER = "[DONE]";

    private final OkHttpClient httpClient;
    private final ObjectMapper mapper;
    private final String baseUrl;
    private final String apiKey;
    private final String defaultModel;
    private final double temperature;
    private final int maxTokens;

    public DeepSeekProvider(String baseUrl, String apiKey, String defaultModel,
            double temperature, int maxTokens) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.apiKey = apiKey;
        this.defaultModel = defaultModel;
        this.temperature = temperature;
        this.maxTokens = maxTokens;
        this.httpClient = new OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(120, TimeUnit.SECONDS)
                .writeTimeout(30, TimeUnit.SECONDS)
                .build();
        this.mapper = new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                .setSerializationInclusion(JsonInclude.Include.NON_NULL);
    }

    @Override
    public String getProviderName() {
        return "deepseek";
    }

    @Override
    public String getDefaultModel() {
        return defaultModel;
    }

    @Override
    public List<String> getAvailableModels() {
        return Arrays.asList("deepseek-chat", "deepseek-reasoner");
    }

    @Override
    public String chat(String userMessage) {
        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.builder().role("user").content(userMessage).build());
        return chatWithMessages(messages);
    }

    @Override
    public String chatWithMessages(List<ChatMessage> messages) {
        return chatWithTools(messages, null);
    }

    @Override
    public String chatWithTools(List<ChatMessage> messages, List<ChatTool> tools) {
        ModelProvider.ChatMessageBody result = chatFull(messages, tools);
        return result != null && result.getContent() != null ? result.getContent() : "";
    }

    @Override
    public ModelProvider.ChatMessageBody chatFull(List<ChatMessage> messages, List<ChatTool> tools) {
        ChatRequest req = ChatRequest.builder()
                .model(defaultModel)
                .messages(convertMessages(messages))
                .temperature(temperature)
                .maxTokens(maxTokens)
                .stream(false)
                .tools(tools != null && !tools.isEmpty() ? convertTools(tools) : null)
                .toolChoice(tools != null && !tools.isEmpty() ? "auto" : null)
                .build();

        try {
            String json = mapper.writeValueAsString(req);
            Request httpReq = buildRequest(json, false);
            try (Response resp = httpClient.newCall(httpReq).execute()) {
                assertSuccess(resp);
                String body = resp.body().string();
                ChatResponse chatResp = mapper.readValue(body, ChatResponse.class);
                if (chatResp.getChoices() != null && !chatResp.getChoices().isEmpty()) {
                    return convertToMessageBody(chatResp.getChoices().get(0).getMessage());
                }
                return new ModelProvider.ChatMessageBody("assistant", "", null);
            }
        } catch (Exception e) {
            throw new DeepSeekApiException("DeepSeek API call failed: " + e.getMessage(), e);
        }
    }

    @Override
    public Flux<ChatChunk> streamChunks(List<ChatMessage> messages, List<ChatTool> tools) {
        if (tools != null && !tools.isEmpty()) {
            log.info("DeepSeek API: sending {} tools to LLM", tools.size());
            for (ChatTool t : tools) {
                log.info("  API Tool: name={}, hasParams={}",
                        t.getFunction() != null ? t.getFunction().getName() : "null",
                        t.getFunction() != null && t.getFunction().getParameters() != null);
            }
        }
        ChatRequest req = ChatRequest.builder()
                .model(defaultModel)
                .messages(convertMessages(messages))
                .temperature(temperature)
                .maxTokens(maxTokens)
                .stream(true)
                .tools(tools != null && !tools.isEmpty() ? convertTools(tools) : null)
                .toolChoice(tools != null && !tools.isEmpty() ? "auto" : null)
                .build();

        return Flux.<ChatChunk>create(sink -> {
            try {
                String json = mapper.writeValueAsString(req);
                Request httpReq = buildRequest(json, true);
                Response resp = httpClient.newCall(httpReq).execute();
                if (!resp.isSuccessful()) {
                    sink.error(new DeepSeekApiException("HTTP " + resp.code() + " " + resp.body().string()));
                    return;
                }
                ResponseBody respBody = resp.body();
                if (respBody == null) {
                    sink.complete();
                    return;
                }
                BufferedReader reader = new BufferedReader(
                        new InputStreamReader(respBody.byteStream(), StandardCharsets.UTF_8));
                String line;
                while ((line = reader.readLine()) != null) {
                    if (sink.isCancelled())
                        break;
                    if (line.startsWith("data: ")) {
                        String data = line.substring(6).trim();
                        if (DONE_MARKER.equals(data)) {
                            break;
                        }
                        if (!data.isEmpty()) {
                            try {
                                StreamChunk streamChunk = mapper.readValue(data, StreamChunk.class);
                                ModelProvider.ChatChunk chunk = convertStreamChunk(streamChunk);
                                sink.next(chunk);
                            } catch (Exception e) {
                                log.warn("Failed to parse SSE chunk: {}", data);
                            }
                        }
                    }
                }
                sink.complete();
            } catch (IOException e) {
                sink.error(new DeepSeekApiException("SSE stream error: " + e.getMessage(), e));
            }
        }, FluxSink.OverflowStrategy.BUFFER)
                .subscribeOn(Schedulers.boundedElastic());
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private List<ChatMessageBody> convertMessages(List<ChatMessage> messages) {
        List<ChatMessageBody> result = new ArrayList<>();
        if (messages != null) {
            for (ChatMessage m : messages) {
                ChatMessageBody body = new ChatMessageBody();
                body.setRole(m.getRole());
                body.setContent(m.getContent());
                // Pass through reasoning_content for assistant messages (DeepSeek thinking
                // mode)
                if ("assistant".equals(m.getRole()) && m.getReasoningContent() != null) {
                    body.setReasoningContent(m.getReasoningContent());
                }
                // Pass through tool_call_id for tool role messages
                if ("tool".equals(m.getRole()) && m.getToolCallId() != null) {
                    body.setToolCallId(m.getToolCallId());
                }
                // Pass through tool_calls for assistant messages
                if ("assistant".equals(m.getRole()) && m.getToolCalls() != null && !m.getToolCalls().isEmpty()) {
                    List<ToolCall> toolCalls = new ArrayList<>();
                    for (ChatMessage.ToolCallInfo tc : m.getToolCalls()) {
                        ToolCall toolCall = new ToolCall();
                        toolCall.setId(tc.getId());
                        toolCall.setType(tc.getType() != null ? tc.getType() : "function");
                        ToolCallFunction fn = new ToolCallFunction();
                        fn.setName(tc.getFunction() != null ? tc.getFunction().getName() : "");
                        fn.setArguments(tc.getFunction() != null ? tc.getFunction().getArguments() : "{}");
                        toolCall.setFunction(fn);
                        toolCalls.add(toolCall);
                    }
                    body.setToolCalls(toolCalls);
                }
                result.add(body);
            }
        }
        return result;
    }

    private List<Tool> convertTools(List<ChatTool> clientTools) {
        List<Tool> tools = new ArrayList<>();
        for (ChatTool tool : clientTools) {
            if (tool.getFunction() != null) {
                ChatFunction fn = tool.getFunction();
                Tool t = new Tool();
                t.setType(tool.getType() != null ? tool.getType() : "function");
                FunctionDef functionDef = new FunctionDef();
                functionDef.setName(fn.getName());
                functionDef.setDescription(fn.getDescription());
                // Use JSONUtil to properly serialize the JSONObject
                functionDef.setParameters(
                        fn.getParameters() != null ? cn.hutool.json.JSONUtil.toJsonStr(fn.getParameters()) : null);
                t.setFunction(functionDef);
                tools.add(t);
            }
        }
        return tools;
    }

    private ModelProvider.ChatChunk convertStreamChunk(StreamChunk sc) {
        ModelProvider.ChatChunk chunk = new ModelProvider.ChatChunk();
        if (sc.getChoices() != null) {
            List<ModelProvider.ChatChunk.Choice> choices = new ArrayList<>();
            for (StreamChoice streamChoice : sc.getChoices()) {
                ModelProvider.ChatChunk.Choice choice = new ModelProvider.ChatChunk.Choice();
                choice.setFinishReason(streamChoice.getFinishReason());
                if (streamChoice.getDelta() != null) {
                    ModelProvider.ChatChunk.Delta delta = new ModelProvider.ChatChunk.Delta();
                    delta.setRole(streamChoice.getDelta().getRole());
                    delta.setContent(streamChoice.getDelta().getContent());
                    delta.setReasoningContent(streamChoice.getDelta().getReasoningContent());
                    if (streamChoice.getDelta().getToolCalls() != null) {
                        List<ModelProvider.ToolCall> toolCalls = new ArrayList<>();
                        for (ToolCall tc : streamChoice.getDelta().getToolCalls()) {
                            ModelProvider.ToolCall mptc = new ModelProvider.ToolCall();
                            mptc.setId(tc.getId());
                            mptc.setType(tc.getType());
                            mptc.setIndex(tc.getIndex());
                            if (tc.getFunction() != null) {
                                mptc.setName(tc.getFunction().getName());
                                mptc.setArguments(tc.getFunction().getArguments());
                            }
                            toolCalls.add(mptc);
                        }
                        delta.setToolCalls(toolCalls);
                    }
                    choice.setDelta(delta);
                }
                choices.add(choice);
            }
            chunk.setChoices(choices);
        }
        return chunk;
    }

    private ModelProvider.ChatMessageBody convertToMessageBody(ChatMessageBody original) {
        if (original == null)
            return null;
        ModelProvider.ChatMessageBody result = new ModelProvider.ChatMessageBody();
        result.setRole(original.getRole());
        result.setContent(original.getContent());
        result.setReasoningContent(original.getReasoningContent());
        // Convert internal ToolCall to ModelProvider.ToolCall
        if (original.getToolCalls() != null && !original.getToolCalls().isEmpty()) {
            List<ModelProvider.ToolCall> toolCalls = new ArrayList<>();
            for (ToolCall tc : original.getToolCalls()) {
                ModelProvider.ToolCall mpTc = new ModelProvider.ToolCall();
                mpTc.setId(tc.getId());
                mpTc.setType(tc.getType());
                if (tc.getFunction() != null) {
                    mpTc.setName(tc.getFunction().getName());
                    mpTc.setArguments(tc.getFunction().getArguments());
                }
                toolCalls.add(mpTc);
            }
            result.setToolCalls(toolCalls);
        }
        result.setToolCallId(original.getToolCallId());
        return result;
    }

    private Request buildRequest(String jsonBody, boolean stream) {
        return new Request.Builder()
                .url(baseUrl + CHAT_PATH)
                .addHeader("Authorization", "Bearer " + apiKey)
                .addHeader("Content-Type", "application/json")
                .addHeader("Accept", stream ? "text/event-stream" : "application/json")
                .post(RequestBody.create(jsonBody, JSON))
                .build();
    }

    private void assertSuccess(Response resp) throws IOException {
        if (!resp.isSuccessful()) {
            String body = resp.body() != null ? resp.body().string() : "(no body)";
            throw new DeepSeekApiException("HTTP " + resp.code() + ": " + body);
        }
    }

    // -------------------------------------------------------------------------
    // Internal DTOs
    // -------------------------------------------------------------------------

    /**
     * Internal message body for API serialization with proper Jackson annotations.
     */
    public static class ChatMessageBody {
        private String role;
        private String content;
        @com.fasterxml.jackson.annotation.JsonProperty("reasoning_content")
        private String reasoningContent;
        @com.fasterxml.jackson.annotation.JsonProperty("tool_calls")
        private List<ToolCall> toolCalls;
        @com.fasterxml.jackson.annotation.JsonProperty("tool_call_id")
        private String toolCallId;

        public String getRole() {
            return role;
        }

        public void setRole(String role) {
            this.role = role;
        }

        public String getContent() {
            return content;
        }

        public void setContent(String content) {
            this.content = content;
        }

        public String getReasoningContent() {
            return reasoningContent;
        }

        public void setReasoningContent(String reasoningContent) {
            this.reasoningContent = reasoningContent;
        }

        public List<ToolCall> getToolCalls() {
            return toolCalls;
        }

        public void setToolCalls(List<ToolCall> toolCalls) {
            this.toolCalls = toolCalls;
        }

        public String getToolCallId() {
            return toolCallId;
        }

        public void setToolCallId(String toolCallId) {
            this.toolCallId = toolCallId;
        }
    }

    /**
     * Tool call structure for API serialization.
     */
    public static class ToolCall {
        private String id;
        private String type;
        private ToolCallFunction function;
        private Integer index;

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public ToolCallFunction getFunction() {
            return function;
        }

        public void setFunction(ToolCallFunction function) {
            this.function = function;
        }

        public Integer getIndex() {
            return index;
        }

        public void setIndex(Integer index) {
            this.index = index;
        }
    }

    /**
     * Tool call function details.
     */
    public static class ToolCallFunction {
        private String name;
        private String arguments;

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getArguments() {
            return arguments;
        }

        public void setArguments(String arguments) {
            this.arguments = arguments;
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ChatRequest {
        private String model;
        private List<ChatMessageBody> messages;
        private Double temperature;
        @com.fasterxml.jackson.annotation.JsonProperty("max_tokens")
        private Integer maxTokens;
        private Boolean stream;
        private List<Tool> tools;
        @com.fasterxml.jackson.annotation.JsonProperty("tool_choice")
        private Object toolChoice;

        public static Builder builder() {
            return new Builder();
        }

        public static class Builder {
            private final ChatRequest req = new ChatRequest();

            public Builder model(String model) {
                req.model = model;
                return this;
            }

            public Builder messages(List<ChatMessageBody> messages) {
                req.messages = messages;
                return this;
            }

            public Builder temperature(Double temperature) {
                req.temperature = temperature;
                return this;
            }

            public Builder maxTokens(Integer maxTokens) {
                req.maxTokens = maxTokens;
                return this;
            }

            public Builder stream(Boolean stream) {
                req.stream = stream;
                return this;
            }

            public Builder tools(List<Tool> tools) {
                req.tools = tools;
                return this;
            }

            public Builder toolChoice(Object toolChoice) {
                req.toolChoice = toolChoice;
                return this;
            }

            public ChatRequest build() {
                return req;
            }
        }

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }

        public List<ChatMessageBody> getMessages() {
            return messages;
        }

        public void setMessages(List<ChatMessageBody> messages) {
            this.messages = messages;
        }

        public Double getTemperature() {
            return temperature;
        }

        public void setTemperature(Double temperature) {
            this.temperature = temperature;
        }

        public Integer getMaxTokens() {
            return maxTokens;
        }

        public void setMaxTokens(Integer maxTokens) {
            this.maxTokens = maxTokens;
        }

        public Boolean getStream() {
            return stream;
        }

        public void setStream(Boolean stream) {
            this.stream = stream;
        }

        public List<Tool> getTools() {
            return tools;
        }

        public void setTools(List<Tool> tools) {
            this.tools = tools;
        }

        public Object getToolChoice() {
            return toolChoice;
        }

        public void setToolChoice(Object toolChoice) {
            this.toolChoice = toolChoice;
        }
    }

    public static class ChatResponse {
        private List<Choice> choices;

        public List<Choice> getChoices() {
            return choices;
        }

        public void setChoices(List<Choice> choices) {
            this.choices = choices;
        }
    }

    public static class Choice {
        private ChatMessageBody message;

        public ChatMessageBody getMessage() {
            return message;
        }

        public void setMessage(ChatMessageBody message) {
            this.message = message;
        }
    }

    public static class Tool {
        private String type;
        private FunctionDef function;

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public FunctionDef getFunction() {
            return function;
        }

        public void setFunction(FunctionDef function) {
            this.function = function;
        }
    }

    public static class FunctionDef {
        private String name;
        private String description;

        @com.fasterxml.jackson.annotation.JsonRawValue
        private String parameters;

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }

        public String getParameters() {
            return parameters;
        }

        public void setParameters(String parameters) {
            this.parameters = parameters;
        }
    }

    /**
     * Internal streaming chunk DTO matching DeepSeek SSE format.
     */
    static class StreamChunk {
        private List<StreamChoice> choices;

        public List<StreamChoice> getChoices() {
            return choices;
        }

        public void setChoices(List<StreamChoice> choices) {
            this.choices = choices;
        }
    }

    static class StreamChoice {
        private StreamDelta delta;
        @com.fasterxml.jackson.annotation.JsonProperty("finish_reason")
        private String finishReason;

        public StreamDelta getDelta() {
            return delta;
        }

        public void setDelta(StreamDelta delta) {
            this.delta = delta;
        }

        public String getFinishReason() {
            return finishReason;
        }

        public void setFinishReason(String finishReason) {
            this.finishReason = finishReason;
        }
    }

    static class StreamDelta {
        private String role;
        private String content;
        @com.fasterxml.jackson.annotation.JsonProperty("reasoning_content")
        private String reasoningContent;
        @com.fasterxml.jackson.annotation.JsonProperty("tool_calls")
        private List<ToolCall> toolCalls;

        public String getRole() {
            return role;
        }

        public void setRole(String role) {
            this.role = role;
        }

        public String getContent() {
            return content;
        }

        public void setContent(String content) {
            this.content = content;
        }

        public String getReasoningContent() {
            return reasoningContent;
        }

        public void setReasoningContent(String reasoningContent) {
            this.reasoningContent = reasoningContent;
        }

        public List<ToolCall> getToolCalls() {
            return toolCalls;
        }

        public void setToolCalls(List<ToolCall> toolCalls) {
            this.toolCalls = toolCalls;
        }
    }

    public static class DeepSeekApiException extends RuntimeException {
        public DeepSeekApiException(String message) {
            super(message);
        }

        public DeepSeekApiException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
