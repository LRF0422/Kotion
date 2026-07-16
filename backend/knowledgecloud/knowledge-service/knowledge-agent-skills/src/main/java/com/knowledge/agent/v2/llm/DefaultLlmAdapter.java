package com.knowledge.agent.v2.llm;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.llm.LlmClient;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmRequest;
import com.knowledge.agent.llm.LlmResponse;
import com.knowledge.agent.llm.StreamChunk;
import com.knowledge.agent.v2.session.ConversationMessage;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Default {@link LlmAdapter} implementation that bridges to V1's {@link LlmClient}.
 *
 * <p>This adapter allows the V2 engine to reuse the existing LLM infrastructure
 * (OpenAiCompatibleClient, LlmClientFactory) without duplication. The translation
 * layer converts between V2's immutable message model and V1's mutable DTOs.
 *
 * <p>Over time, this can be replaced with a direct HTTP adapter that speaks
 * V2 DTOs natively.
 */
@Slf4j
public class DefaultLlmAdapter implements LlmAdapter {

    private final LlmClientFactory clientFactory;
    private final String modelName;

    public DefaultLlmAdapter(LlmClientFactory clientFactory, String modelName) {
        this.clientFactory = clientFactory;
        this.modelName = modelName;
    }

    @Override
    public Flux<LlmChunk> streamInfer(InferenceRequest request) {
        LlmClient client = clientFactory.getClientForModel(
                request.getModel() != null ? request.getModel() : modelName);

        LlmRequest v1Request = buildV1Request(request);
        return client.streamChat(v1Request)
                .map(this::convertChunk);
    }

    @Override
    public Mono<InferenceResponse> infer(InferenceRequest request) {
        LlmClient client = clientFactory.getClientForModel(
                request.getModel() != null ? request.getModel() : modelName);

        LlmRequest v1Request = buildV1Request(request);

        return Mono.fromCallable(() -> client.chat(v1Request))
                .map(this::convertResponse);
    }

    @Override
    public ModelCapabilities capabilities() {
        return ModelCapabilities.defaultCapabilities(modelName);
    }

    // ---- V1 ↔ V2 conversion ----

    private LlmRequest buildV1Request(InferenceRequest request) {
        List<ChatMessage> v1Messages = request.getMessages().stream()
                .map(this::toV1Message)
                .collect(Collectors.toList());

        return LlmRequest.builder()
                .model(request.getModel())
                .messages(v1Messages)
                .toolsJson(request.getToolsJson())
                .toolChoice(request.getToolChoice())
                .temperature(request.getTemperature())
                .maxTokens(request.getMaxTokens())
                .stream(request.isStream())
                .build();
    }

    private ChatMessage toV1Message(ConversationMessage msg) {
        ChatMessage.ChatMessageBuilder builder = ChatMessage.builder()
                .role(msg.getRole())
                .content(msg.getContent())
                .toolCallId(msg.getToolCallId())
                .name(msg.getName())
                .reasoningContent(msg.getReasoningContent());

        if (msg.getToolCalls() != null && !msg.getToolCalls().isEmpty()) {
            List<ChatMessage.ToolCallInfo> toolCalls = msg.getToolCalls().stream()
                    .map(tc -> new ChatMessage.ToolCallInfo(
                            tc.getId(), "function",
                            new ChatMessage.ToolCallInfo.FunctionInfo(tc.getFunctionName(), tc.getFunctionArguments())))
                    .collect(Collectors.toList());
            builder.toolCalls(toolCalls);
        }

        return builder.build();
    }

    private LlmChunk convertChunk(StreamChunk chunk) {
        if ("done".equals(chunk.getType())) {
            LlmResponse.Usage usage = chunk.getUsage();
            return LlmChunk.finish(
                    chunk.getFinishReason() != null ? chunk.getFinishReason() : "stop",
                    usage != null ? usage.getPromptTokens() : 0,
                    usage != null ? usage.getCompletionTokens() : 0);
        }

        // Text content delta
        if (chunk.getContent() != null && !chunk.getContent().isEmpty()) {
            return LlmChunk.textDelta(chunk.getContent());
        }

        // Reasoning content delta
        if (chunk.getReasoningContent() != null && !chunk.getReasoningContent().isEmpty()) {
            return LlmChunk.reasoningDelta(chunk.getReasoningContent());
        }

        // Tool call delta
        if (chunk.getToolCallId() != null || chunk.getToolCallName() != null
                || chunk.getToolCallArgumentsDelta() != null) {
            int index = chunk.getToolCallIndex() != null ? chunk.getToolCallIndex() : 0;
            return LlmChunk.toolCallDelta(
                    index,
                    chunk.getToolCallId(),
                    chunk.getToolCallName(),
                    chunk.getToolCallArgumentsDelta());
        }

        // Empty/unknown chunk — emit as empty text
        return LlmChunk.textDelta("");
    }

    private InferenceResponse convertResponse(LlmResponse v1Response) {
        InferenceResponse.Builder builder = InferenceResponse.builder()
                .content(v1Response.getContent())
                .reasoningContent(v1Response.getReasoningContent())
                .finishReason(v1Response.getFinishReason());

        if (v1Response.getUsage() != null) {
            builder.promptTokens(v1Response.getUsage().getPromptTokens())
                    .completionTokens(v1Response.getUsage().getCompletionTokens());
        }

        if (v1Response.hasToolCalls()) {
            List<InferenceResponse.ToolCallData> toolCalls = v1Response.getToolCalls().stream()
                    .map(tc -> new InferenceResponse.ToolCallData(tc.getId(), tc.getName(), tc.getArguments()))
                    .collect(Collectors.toList());
            builder.toolCalls(toolCalls);
        }

        return builder.build();
    }
}
