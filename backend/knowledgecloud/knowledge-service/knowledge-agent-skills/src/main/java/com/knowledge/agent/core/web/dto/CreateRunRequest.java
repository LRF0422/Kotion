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

    /** Skills: prompt fragment plus the names and schemas of the tools they own. */
    private List<SkillInput> skills = new ArrayList<>();

    /**
     * Overflow past the provider's tool ceiling: CALLABLE, but not advertised to
     * the model with a schema until its first call. Clients advertise every
     * callable tool in {@link #tools} — a model cannot reliably call a function
     * it never saw declared — so this list holds only what did not fit, and is
     * empty whenever the catalog fits.
     */
    private List<ToolSpec> deferredTools = new ArrayList<>();

    private Double temperature;

    private Integer maxTokens;

    /**
     * Instruction for a pure-text run ({@link #noTools}): the task itself
     * ("translate this", "polish that"), used as the whole system message. This
     * is task DATA, not agent policy.
     */
    private String instruction;

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
