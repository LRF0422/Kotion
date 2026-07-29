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

    /**
     * @deprecated Tool schemas should travel inside
     *             {@link SkillPayload#getTools()}.
     *             The top-level {@code tools[]} array is retained for backward
     *             compatibility
     *             but will be empty when the frontend operates in skills-only mode
     *             (KN_SKILLS_ONLY_CATALOG). The backend's
     *             {@code AgentHarness.mergeFrontendTools()}
     *             already handles null/empty gracefully.
     */
    @Deprecated
    @ApiModelProperty("Tools to enable (OpenAI-compatible format). Deprecated — use SkillPayload.tools instead.")
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

    @ApiModelProperty(value = "Run mode: 'execute' (default) or 'plan' (read-only research → plan → approval)", example = "execute")
    private String mode;

    @ApiModelProperty("Custom agent definition id — when set, the session is assembled from the definition (system prompt / model / tool set / max iterations)")
    private Long agentId;
}
