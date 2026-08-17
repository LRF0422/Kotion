package com.knowledge.agentcore.supervisor;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agentcore.tool.ToolSpec;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * Create-run command — assembled by the controller from the HTTP request and
 * the security context, executed by the supervisor.
 */
@Data
public class CreateRunCommand {

    private String conversationId;

    private String model;

    /** execute | plan */
    private String mode = "execute";

    /** Conversation history including the latest user message. */
    private List<ChatMessage> messages = new ArrayList<>();

    /** Client-declared (editor) tools. */
    private List<ToolSpec> tools = new ArrayList<>();

    /** Skills system-prompt fragments. */
    private List<String> skillFragments = new ArrayList<>();

    /** Long-term memory lines injected at run start (M2). */
    private List<String> memoryLines = new ArrayList<>();

    private Double temperature;

    private Integer maxTokens;

    /** Step budget (sub-runs may pass their own; null = config default). */
    private Integer maxSteps;

    /** Pure-text mode: no tools offered to the model at all. */
    private boolean noTools;

    private Long userId;

    private Long tenantId;

    /** Caller JWT token (forwarded to remote skill callbacks). */
    private String token;

    /** Editor scope (memory scoping). */
    private String spaceId;

    private String pageId;
}
