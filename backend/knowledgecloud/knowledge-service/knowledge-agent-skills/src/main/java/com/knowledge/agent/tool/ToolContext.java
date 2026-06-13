package com.knowledge.agent.tool;

import com.knowledge.agent.api.dto.AgentMode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Tool execution context.
 * Carries user info, session data, and delegate depth for recursion guard.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ToolContext {

    private Long userId;
    private Long tenantId;
    private String token;
    private String sessionId;
    private String conversationId;

    /**
     * User's display name (from JWT / SecurityContext).
     * Used to personalise the system prompt so the LLM knows who it is talking to.
     */
    private String userName;

    /**
     * User's login account.
     */
    private String account;

    /**
     * Tenant ID as String (from JWT / SecurityContext).
     * This duplicates the Long tenantId for convenience — the JWT stores it as a
     * String.
     */
    private String tenantIdStr;

    /**
     * User's role name (e.g. "administrator", "editor").
     */
    private String roleName;

    /**
     * Current delegate depth — incremented when spawning sub-agents.
     * Used by DelegateTool to prevent runaway recursion.
     */
    @Builder.Default
    private int delegateDepth = 0;

    /**
     * Id of the agent that owns this context. {@code null} for the root agent;
     * a sub-agent's own id once spawned. DelegateTool reads this as the
     * {@code parentAgentId} of any sub-agents it spawns, enabling a sub-agent
     * tree (including nested delegation).
     */
    private String agentId;

    /**
     * Run mode (P7). PLAN restricts the agent to read-only tools; sub-agents
     * inherit it so plan-mode research delegation stays read-only.
     */
    @Builder.Default
    private AgentMode mode = AgentMode.EXECUTE;

    /**
     * Create a child context with incremented delegate depth, preserving the
     * owning {@code agentId} of the spawner and the run {@code mode}.
     */
    public ToolContext incrementDepth() {
        return ToolContext.builder()
                .userId(this.userId)
                .tenantId(this.tenantId)
                .token(this.token)
                .sessionId(this.sessionId)
                .conversationId(this.conversationId)
                .userName(this.userName)
                .account(this.account)
                .tenantIdStr(this.tenantIdStr)
                .roleName(this.roleName)
                .delegateDepth(this.delegateDepth + 1)
                .agentId(this.agentId)
                .mode(this.mode)
                .build();
    }
}
