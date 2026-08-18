package com.knowledge.agent.core.tool;

import lombok.Data;

/**
 * Per-execution context handed to backend tools. Identity/scope fields plus a
 * scratchpad holder (working memory) the loop keeps in sync with the
 * checkpoint.
 */
@Data
public class ToolContext {

    private String runId;

    private String conversationId;

    private String model;

    private String mode;

    private Long userId;

    private Long tenantId;

    /** Caller JWT token (forwarded to remote skill callbacks). */
    private String token;

    /** Scope for memory tools (space/page may be null). */
    private String spaceId;

    private String pageId;

    /** The step number currently executing. */
    private int step;

    /** Sub-agent delegation depth (0 = root run). */
    private int delegateDepth;

    /** Client-declared tool catalog of this run (delegate tool subsetting). */
    private java.util.List<com.knowledge.agent.core.tool.ToolSpec> clientTools;

    /** Deferred (skill-owned) tools of this run — inherited by sub-agents. */
    private java.util.List<com.knowledge.agent.core.tool.ToolSpec> deferredTools;

    /** Working-memory scratchpad holder (read/write). */
    private ScratchpadHolder scratchpad = new ScratchpadHolder();

    /** Free-form working memory (agent-managed string). */
    @Data
    public static class ScratchpadHolder {
        private String value = "";

        public String read() {
            return value == null ? "" : value;
        }

        public void write(String newValue) {
            this.value = newValue == null ? "" : newValue;
        }
    }
}
