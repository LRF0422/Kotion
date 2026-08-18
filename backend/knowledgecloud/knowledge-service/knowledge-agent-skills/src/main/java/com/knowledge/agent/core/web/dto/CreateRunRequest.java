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

    /** Client-declared (editor) tools — always registered and always offered to the model. */
    private List<ToolSpec> tools = new ArrayList<>();

    /** Skills with system-prompt fragments (and their deferred tool schemas). */
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

        /**
         * Tool schemas this skill owns (typically editor plugin tools).
         *
         * <p>These are <em>deferred</em>: registered as callable but kept out of
         * the model's tool list, so their JSON Schemas don't inflate every
         * prompt. The system prompt advertises them by name + description, and
         * the first call activates the schema for the remainder of the run.
         */
        private List<ToolSpec> tools = new ArrayList<>();
    }
}
