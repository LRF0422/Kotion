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

    /**
     * Tools that are callable but NOT advertised to this run's model with a
     * full schema — the skill-owned tools. They reach the run through the
     * deferred catalog, so the model's tool list stays small.
     */
    private List<ToolSpec> deferredTools = new ArrayList<>();

    private Double temperature;

    private Integer maxTokens;

    /**
     * Extra system-prompt text supplied by the client (editor rules, page-tree
     * guidance) — appended after the backend's base prompt, since the backend
     * cannot import the frontend constants that own them.
     */
    private String systemPrompt;

    /**
     * Per-run volatile context (e.g. the bound page title). Appended to the
     * injected context block behind the cacheable history instead of the
     * invariant system prompt, so a page switch cannot invalidate the whole
     * conversation's prefix cache.
     */
    private String contextNote;

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
         * Names of the tools this skill owns, as declared by the client. They are
         * rendered under the fragment (see
         * {@code ContextManager#renderSkillFragment}) so the model can map the
         * prose description onto exact function names: the deferred directory
         * lists names and signatures but no descriptions, so without this the two
         * halves of the catalogue never meet.
         */
        private List<String> requiredTools = new ArrayList<>();

        /** Tools the skill may call in addition to its required ones. */
        private List<String> optionalTools = new ArrayList<>();

        /**
         * Tool schemas this skill owns (typically editor plugin tools).
         *
         * <p>These are <em>deferred</em>: registered as callable but kept out of
         * the model's tool list, so their JSON Schemas don't inflate every
         * prompt. The directory advertises them by name + signature, and the
         * first call returns the full schema.
         */
        private List<ToolSpec> tools = new ArrayList<>();
    }
}
