package com.knowledge.agent.store;

import com.knowledge.agent.api.dto.ChatMessage;
import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Set;

/**
 * Full state snapshot of an agent loop, persisted to disk for crash recovery.
 *
 * <p>
 * Unlike the Redis-backed {@link AgentEventStore} (which is an append-only
 * event
 * log for SSE replay), this captures the <b>mutable working state</b> of the
 * agent loop at a natural commit point — the working message list, iteration
 * counter, activated skills, and recent tool calls. On restart, a snapshot can
 * be loaded to resume the loop from where it left off instead of starting over.
 *
 * <p>
 * Snapshots are best-effort: if the file is missing or corrupt, the loop simply
 * starts fresh. They are never on the critical path of the streaming response.
 */
@Data
@Builder
public class AgentStateSnapshot {

    /** Conversation ID the snapshot belongs to. */
    private String conversationId;

    /** Session ID (unique per agent run, used as the file key). */
    private String sessionId;

    /** Agent ID (null for the root agent, set for sub-agents). */
    private String agentId;

    /** Parent agent ID (null for the root agent). */
    private String parentAgentId;

    /** Delegate depth (0 for root). */
    private int depth;

    /** Current iteration number when the snapshot was taken. */
    private int iteration;

    /** Full working message list at the commit point. */
    private List<ChatMessage> workingMessages;

    /** Names of skills that have been activated so far in this session. */
    private Set<String> activatedSkillNames;

    /** Recent tool call records for audit / recovery context. */
    private List<ToolCallRecord> toolCallHistory;

    /**
     * Orchestration plan JSON (nullable, for future use when plan-mode
     * plans are persisted).
     */
    private String orchestrationPlan;

    /**
     * Full V2 session payload as JSON (see
     * {@code com.knowledge.agent.v2.state.SessionSnapshotCodec}). When set,
     * this is the authoritative session state; the legacy V1 fields above
     * remain for backward-compatible rows.
     */
    private String v2SessionJson;

    /** Epoch millis when the snapshot was taken. */
    private long timestamp;

    /**
     * A single tool call record — the tool call and its execution result.
     */
    @Data
    @Builder
    public static class ToolCallRecord {
        private String toolCallId;
        private String toolName;
        private String arguments;
        private String result;
        private boolean success;
    }
}
