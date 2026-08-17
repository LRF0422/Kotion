package com.knowledge.agent.core.checkpoint;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.run.PendingToolCall;
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

    /** Step budget per grant cycle (defaults from config; sub-runs may differ). */
    private Integer maxSteps;

    /** Pure-text mode: no tools offered to the model at all. */
    private boolean noTools;

    private String mode;

    private String model;

    /** Sampling settings (recovery must reproduce the original run). */
    private Double temperature;

    private Integer maxTokens;

    /** Client-declared (editor) tool catalog — persisted for loop recovery. */
    private List<com.knowledge.agent.core.tool.ToolSpec> clientTools = new ArrayList<>();

    /** Full conversation including system prefix and injected memory. */
    private List<ChatMessage> messages = new ArrayList<>();

    /** Frontend tool calls currently awaited (WAITING_TOOLS; subRunId marks children). */
    private List<PendingToolCall> pendingToolCalls = new ArrayList<>();

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

    /** Caller JWT token (forwarded to remote skill callbacks). */
    private String token;

    /** Sub-agent delegation depth (0 = root run). */
    private int delegateDepth;

    /** Plan mode gate (false until plan approval in plan mode). */
    private boolean planGateOpen;

    private long createTime;
}
