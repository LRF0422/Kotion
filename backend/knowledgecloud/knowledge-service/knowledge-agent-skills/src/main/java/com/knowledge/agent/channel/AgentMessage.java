package com.knowledge.agent.channel;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Typed message for inter-agent communication via AgentChannel.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AgentMessage {

    /**
     * Message type.
     */
    private Type type;

    /**
     * The agent that sent this message.
     */
    private String agentId;

    /**
     * Message content.
     */
    private String content;

    /**
     * Optional detail payload.
     */
    private String detail;

    public enum Type {
        /** Incremental progress update */
        PROGRESS,
        /** Task completion result */
        RESULT,
        /** Cannot proceed, dependencies blocked — reserved for future
         *  cross-agent coordination (currently defined but not consumed) */
        BLOCKER,
        /** Request assistance from coordinator — reserved for future
         *  cross-agent coordination (currently defined but not consumed) */
        HELP
    }

    // ---- Factory methods ----

    public static AgentMessage progress(String agentId, String content) {
        return AgentMessage.builder().type(Type.PROGRESS).agentId(agentId).content(content).build();
    }

    public static AgentMessage result(String agentId, String content) {
        return AgentMessage.builder().type(Type.RESULT).agentId(agentId).content(content).build();
    }

    public static AgentMessage blocker(String agentId, String content) {
        return AgentMessage.builder().type(Type.BLOCKER).agentId(agentId).content(content).build();
    }

    public static AgentMessage help(String agentId, String content) {
        return AgentMessage.builder().type(Type.HELP).agentId(agentId).content(content).build();
    }
}
