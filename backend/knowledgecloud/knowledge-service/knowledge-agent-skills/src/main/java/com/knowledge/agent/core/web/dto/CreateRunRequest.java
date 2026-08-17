package com.knowledge.agent.core.web.dto;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.tool.ToolSpec;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * POST /api/agent/v1/runs request body.
 */
@Data
public class CreateRunRequest {

    /** Conversation/thread id (required). */
    private String conversationId;

    private String model;

    /** execute | plan */
    private String mode = "execute";

    /** Conversation history including the latest user message. */
    private List<ChatMessage> messages = new ArrayList<>();

    /** Client-declared (editor) tools. */
    private List<ToolSpec> tools = new ArrayList<>();

    /** Skills with system-prompt fragments. */
    private List<SkillInput> skills = new ArrayList<>();

    private Double temperature;

    private Integer maxTokens;

    /** Pure-text mode: no tools offered to the model at all. */
    private boolean noTools;

    /** Editor scope for memory scoping. */
    private String spaceId;

    private String pageId;

    @Data
    public static class SkillInput {
        private String name;
        private String systemPromptFragment;
    }
}
