package com.knowledge.agent.core.supervisor;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.savedskill.SavedSkillProvenance;
import com.knowledge.agent.core.tool.ToolSpec;
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

    /** Client-declared (editor) tools — always offered to the model. */
    private List<ToolSpec> tools = new ArrayList<>();

    /**
     * Deferred tool catalog contributed by skills: callable, but withheld from
     * the model's tool list until first use (keeps plugin schemas out of the
     * prompt). Advertised in the system prompt by name + description.
     */
    private List<ToolSpec> skillTools = new ArrayList<>();

    /** Skills system-prompt fragments. */
    private List<String> skillFragments = new ArrayList<>();

    /** Long-term memory lines injected at run start (M2). */
    private List<String> memoryLines = new ArrayList<>();

    /**
     * Derived low-sensitivity user-profile lines injected at run start
     * (optional; empty when the feature is off or the user has not opted in).
     */
    private List<String> profileLines = new ArrayList<>();

    /**
     * Rolling session-memory summary of this conversation (thread summary,
     * continuously updated on each completed run) — injected into the system
     * prompt of fresh runs so continuity survives client-side history loss.
     */
    private String threadSummary;

    /** Personal saved skills selected for this fresh run. */
    private List<SavedSkillProvenance> savedSkillProvenance = new ArrayList<>();

    private Double temperature;

    private Integer maxTokens;

    /** Extra system-prompt text appended after the base prompt (client editor rules). */
    private String systemPrompt;

    /**
     * Per-run volatile context note (e.g. the bound page). It is folded into
     * the appended context block — never into the invariant system prefix —
     * and persisted with the turn so the conversation log stays append-only.
     */
    private String contextNote;

    /**
     * True when the injected per-turn context is already part of the supplied
     * conversation history (the supervisor persisted it), so the loop must not
     * inject a second copy.
     */
    private boolean contextInHistory;

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
