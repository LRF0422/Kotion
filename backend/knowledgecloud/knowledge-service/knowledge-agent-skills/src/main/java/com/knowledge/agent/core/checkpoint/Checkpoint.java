package com.knowledge.agent.core.checkpoint;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.run.PendingToolCall;
import com.knowledge.agent.core.savedskill.SavedSkillProvenance;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * Serializable execution state of a run — the 断点 (checkpoint).
 *
 * <p>Everything needed to rebuild the running loop after a crash, without any
 * runtime handles:
 * <ul>
 *   <li>{@code messages} — the full conversation (post-compaction shape).</li>
 *   <li>{@code pendingToolCalls} — frontend tools the run is waiting for.</li>
 *   <li>{@code scratchpad} — working memory tier.</li>
 *   <li>usage/step counters and the plan gate.</li>
 * </ul>
 * Snapshots are taken at safe boundaries: before every step's inference, on
 * suspend, and at completion.
 */
@Data
public class Checkpoint {

    private String runId;

    /** Event seq at snapshot time. */
    private long seq;

    /** Step number about to run next. */
    private int nextStep;

    /**
     * Number of messages present when the run was created (system prefix +
     * caller-supplied history). Messages at and after this index were produced
     * by this run and are what the session projection appends.
     */
    private int inputMessageCount;

    /** Step budget per grant cycle (defaults from config; sub-runs may differ). */
    private Integer maxSteps;

    /** Pure-text mode: no tools offered to the model at all. */
    private boolean noTools;

    /**
     * Extra client system-prompt text (editor rules) frozen at run creation.
     * Kept on the checkpoint so delegated children inherit it and so a rebuilt
     * loop reproduces the original system prefix.
     *
     * <p>Invariant for the whole conversation: this is the only caller-supplied
     * text allowed into the cacheable system message.
     */
    private String systemPrompt;

    /**
     * Skill system-prompt fragments frozen at run creation (child inheritance
     * and provenance). They are retrieved per turn and <b>never</b> enter the
     * system message — they ride in the volatile tail so a change of fragments
     * cannot invalidate the provider prefix cache.
     */
    private List<String> skillFragments = new ArrayList<>();

    /**
     * Long-term memory lines frozen at run creation (child inheritance). Like
     * {@link #skillFragments} these are per-turn and travel in the volatile
     * tail, never in the system prefix.
     */
    private List<String> memoryLines = new ArrayList<>();

    private String mode;

    private String model;

    /** Sampling settings (recovery must reproduce the original run). */
    private Double temperature;

    private Integer maxTokens;

    /** Client-declared (editor) tool catalog — persisted for loop recovery. */
    private List<com.knowledge.agent.core.tool.ToolSpec> clientTools = new ArrayList<>();

    /**
     * Deferred (skill-owned) tool catalog — callable but withheld from the
     * model's tool list until first use. Persisted so a rebuilt loop keeps the
     * same activation surface; tools already activated have been moved into
     * {@link #clientTools}.
     */
    private List<com.knowledge.agent.core.tool.ToolSpec> deferredTools = new ArrayList<>();

    /** Full conversation including system prefix and injected memory. */
    private List<ChatMessage> messages = new ArrayList<>();

    /** Frozen provenance for personal skills retrieved when this run was created. */
    private List<SavedSkillProvenance> savedSkillProvenance = new ArrayList<>();

    /**
     * Frontend tool calls currently awaited (WAITING_TOOLS). Child calls are
     * never parked here: a delegated run pauses on its own gate and is resumed
     * directly by the client, so the parent stays free to keep working.
     */
    private List<PendingToolCall> pendingToolCalls = new ArrayList<>();

    /** Live child runs this run has delegated to (re-attach after a crash). */
    private List<DelegationRecord> delegations = new ArrayList<>();

    /** plan_approval | budget (why the run is SUSPENDED). */
    private String suspendReason;

    /** present_plan calls awaiting approval (plan_approval suspend). */
    private List<PendingToolCall> pendingPlanCalls = new ArrayList<>();

    /** Accumulated assistant output. */
    private String assistantText;

    /** Working-memory scratchpad (free-form, agent-managed). */
    private String scratchpad;

    private long promptTokens;

    private long completionTokens;

    /** Cumulative prompt tokens served from the provider's context cache. */
    private long cachedPromptTokens;

    /**
     * Caller JWT token (forwarded to remote skill callbacks).
     *
     * <p>Never serialized: the checkpoint JSON is mirrored to MySQL, and a JWT
     * at rest is a credential leak. Recovery prefers {@code AgentRun.token}
     * from Redis hot state; a JC-only rebuild simply loses the token, exactly
     * as it already did when Redis was evicted.
     */
    @JsonIgnore
    private String token;

    /** Sub-agent delegation depth (0 = root run). */
    private int delegateDepth;

    /** Plan mode gate (false until plan approval in plan mode). */
    private boolean planGateOpen;

    private long createTime;
}
