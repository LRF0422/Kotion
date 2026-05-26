package com.knowledge.agent.api.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import io.swagger.annotations.ApiParam;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ApiModel("Chat completion request (OpenAI-compatible)")
public class ChatCompletionRequest {

    @ApiModelProperty(value = "Model name, e.g. deepseek-chat", example = "deepseek-chat")
    private String model;

    @ApiModelProperty("Conversation messages")
    private List<ChatMessage> messages;

    @ApiModelProperty(value = "Stream response", example = "true")
    private Boolean stream;

    @ApiModelProperty(value = "Stream protocol: 'sse' or 'data' (for Vercel AI SDK)", example = "sse")
    private String streamProtocol;

    @ApiModelProperty(value = "Sampling temperature", example = "0.7")
    private Double temperature;

    @ApiModelProperty(value = "Max tokens", example = "4096")
    private Integer maxTokens;

    @ApiModelProperty("Tools to enable (OpenAI-compatible format)")
    private List<ChatTool> tools;

    @ApiModelProperty(value = "Tool choice: 'auto', 'none', 'required', or specific function", example = "auto")
    private Object toolChoice;

    @ApiModelProperty("Conversation id for session continuity")
    private String conversationId;

    @ApiModelProperty("Session ID for caching agent state across messages in the same conversation")
    private String sessionId;

    @ApiModelProperty(value = "User identifier for audit")
    private Long userId;

    @ApiModelProperty(value = "Frontend metadata passthrough (e.g., custom context)")
    private Map<String, Object> data;

    @ApiModelProperty("Skills sent from frontend for progressive discovery by the agent")
    private List<SkillPayload> skills;
}
