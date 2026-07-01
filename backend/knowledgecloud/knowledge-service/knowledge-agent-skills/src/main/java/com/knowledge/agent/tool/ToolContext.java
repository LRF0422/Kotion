package com.knowledge.agent.tool;

import com.knowledge.agent.api.dto.AgentMode;
import com.knowledge.agent.harness.ContextManager;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Tool execution context.
 * Carries user info, session data, and delegate depth for recursion guard.
 *
 * <p>
 * Also carries per-request mutable objects ({@link SkillCatalog},
 * {@link DynamicSkillRegistry}, {@link ContextManager}) that used to be
 * Spring singletons but are now created fresh per request to avoid
 * concurrency bugs. These are set by {@code AgentHarness.run()} for the
 * root agent and by {@code SubAgentFactory.create()} for sub-agents.
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

    // ---- Per-request mutable state (NOT shared across requests) ----

    /**
     * Per-request skill catalog. Set by AgentHarness.run() for the root
     * agent and by SubAgentFactory.create() for sub-agents.
     */
    private SkillCatalog skillCatalog;

    /**
     * Per-request dynamic skill registry. Set by AgentHarness.run() for the
     * root agent and by SubAgentFactory.create() for sub-agents.
     */
    private DynamicSkillRegistry dynamicSkillRegistry;

    /**
     * Per-request context manager. Set by AgentHarness.run() for the root
     * agent and by SubAgentFactory.create() for sub-agents.
     */
    private ContextManager contextManager;

    /**
     * JSON-serialized {@link com.knowledge.agent.orchestrator.AgentTeamPlan}
     * for state-snapshot persistence. Set by AgentHarness when the
     * orchestrator decides to use multi-agent execution. Included in
     * {@link com.knowledge.agent.store.AgentStateSnapshot} so the plan can
     * be recovered on restart.
     */
    private String orchestrationPlan;

    /**
     * Whether this run should resume from a persisted snapshot. When {@code true}
     * (set by the caller before invoking {@code HarnessLoop.run()}), the loop
     * will attempt to restore working messages and iteration state from the
     * {@link com.knowledge.agent.store.AgentStateStore}. When {@code false}
     * (the default), the loop starts fresh — even if a snapshot exists on disk
     * for this session.
     * <p>
     * This flag prevents multi-turn conversations from clobbering the latest
     * user message with a stale mid-execution snapshot: the frontend reuses the
     * same {@code sessionId} across turns, so without this gate turn N+1 would
     * load turn N's tool-call-boundary snapshot and lose the new user input.
     */
    @Builder.Default
    private boolean resume = false;

    /**
     * Create a child context with incremented delegate depth, preserving the
     * owning {@code agentId} of the spawner and the run {@code mode}.
     *
     * <p>
     * Per-request mutable objects ({@link SkillCatalog},
     * {@link DynamicSkillRegistry}, {@link ContextManager}) are deliberately
     * <b>not</b> copied — the child (sub-agent) gets fresh instances from
     * {@code SubAgentFactory.create()}.
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
                .resume(this.resume)
                .build();
    }
}
