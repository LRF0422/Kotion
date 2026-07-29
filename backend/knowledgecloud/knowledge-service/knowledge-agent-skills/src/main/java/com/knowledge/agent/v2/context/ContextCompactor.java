package com.knowledge.agent.v2.context;

import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.llm.InferenceRequest;
import com.knowledge.agent.v2.llm.LlmAdapter;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import lombok.extern.slf4j.Slf4j;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Structured context compactor for long-running agent sessions.
 *
 * <p>
 * Replaces the naive message-count truncation with a two-level strategy
 * driven by REAL token usage ({@code ExecutionState.lastPromptTokens},
 * reported by the provider on every inference call):
 *
 * <ol>
 * <li><b>L1 — tool-result eviction (lossless for reasoning)</b>: tool
 * messages older than {@code evictToolResultsAfterIterations} tool-call
 * rounds have their bulky content replaced by a re-fetch hint. The
 * assistant's reasoning/decision messages are always preserved.</li>
 * <li><b>L2 — LLM structured summary</b>: if still over budget, the middle
 * segment (after system prompt, before the {@code keepRecentMessages}
 * most recent) is summarized into a fixed-template task-state digest,
 * anchored as a single system message right after the system prompt.
 * Re-compaction merges into that anchor instead of stacking.</li>
 * </ol>
 *
 * <p>
 * If the summarization LLM call fails, falls back to aggressive L1
 * (evict every old tool result regardless of size) plus a hard truncation
 * of the middle segment, so the session can always make forward progress.
 *
 * <p>
 * Also performs orphaned-tool-message cleanup (migrated from the removed
 * V1 {@code ContextManager}): providers such as DeepSeek reject requests
 * where an assistant {@code tool_calls} message is not followed by matching
 * tool results, or a tool result has no matching call.
 *
 * <p>
 * This class is pure logic apart from the injected {@link LlmAdapter};
 * every step is unit-testable.
 */
@Slf4j
public class ContextCompactor {

    /** Marker prefix identifying the anchored summary message (single instance). */
    public static final String SUMMARY_MARKER = "[TASK CONTEXT SUMMARY]";

    /**
     * Session metadata key holding the agent-maintained task state (scratchpad).
     */
    public static final String TASK_STATE_METADATA_KEY = "__task_state";

    /** Placeholder template for evicted tool results. */
    private static final String EVICTED_TEMPLATE = "[工具结果已淘汰以节省上下文，如需请重新调用 %s]";

    /** Tool results shorter than this are never evicted (cheap to keep). */
    private static final int EVICT_MIN_CHARS = 500;

    /**
     * Per-message cap when rendering the middle segment into the summary prompt.
     */
    private static final int SUMMARY_INPUT_MSG_MAX_CHARS = 2000;

    private final AgentProperties.ContextConfig config;
    private final LlmAdapter llmAdapter;

    public ContextCompactor(AgentProperties.ContextConfig config, LlmAdapter llmAdapter) {
        this.config = config;
        this.llmAdapter = llmAdapter;
    }

    // ---- Trigger ----

    /**
     * Whether compaction should run before the next THINK.
     *
     * <p>
     * Uses the provider-reported prompt tokens of the most recent call as
     * the authoritative context size; falls back to a chars/4 estimate before
     * the first usage report arrives.
     */
    public boolean shouldCompact(AgentSession session) {
        int lastPromptTokens = session.getExecution().getLastPromptTokens();
        List<ConversationMessage> messages = session.getExecution().getMessages();
        int tokens = lastPromptTokens > 0 ? lastPromptTokens : estimateTokens(messages);
        return tokens > threshold();
    }

    private int threshold() {
        return (int) (config.getMaxContextTokens() * config.getCompactionThreshold());
    }

    // ---- Main entry ----

    /**
     * Compact the session's working messages. Returns the new message list
     * (the caller is responsible for writing it back via
     * {@code ExecutionState.setMessages} — {@code getMessages()} returns a copy).
     */
    public Mono<List<ConversationMessage>> compact(AgentSession session) {
        List<ConversationMessage> messages = cleanupOrphanedToolMessages(session.getExecution().getMessages());

        // Calibrate the chars/4 estimator against the real token count so the
        // post-L1 re-estimate is meaningful (CJK text runs ~1 token/char).
        int lastPromptTokens = session.getExecution().getLastPromptTokens();
        double calibration = calibrationRatio(lastPromptTokens, messages);

        // L1: evict bulky tool results outside the recent tool-call rounds
        List<ConversationMessage> afterL1 = evictOldToolResults(messages, false);
        int estimated = (int) (estimateTokens(afterL1) * calibration);
        if (estimated <= threshold()) {
            log.info("ContextCompactor: session {} L1 eviction sufficient (est {} tokens <= threshold {})",
                    session.getSessionId(), estimated, threshold());
            return Mono.just(afterL1);
        }

        // L2: LLM structured summary of the middle segment
        return summarizeMiddle(session, afterL1)
                .doOnNext(result -> log.info(
                        "ContextCompactor: session {} L2 summary applied, {} -> {} messages",
                        session.getSessionId(), afterL1.size(), result.size()))
                .onErrorResume(e -> {
                    log.warn("ContextCompactor: session {} L2 summarization failed ({}), " +
                            "falling back to aggressive eviction + hard truncation",
                            session.getSessionId(), e.getMessage());
                    return Mono.just(fallbackTruncate(afterL1));
                });
    }

    // ---- L1: tool-result eviction ----

    /**
     * Replace bulky tool-result contents older than
     * {@code evictToolResultsAfterIterations} tool-call rounds with a
     * re-fetch hint. A "round" is an assistant message carrying tool calls.
     *
     * @param aggressive when true, evicts ALL old tool results regardless of size
     */
    List<ConversationMessage> evictOldToolResults(List<ConversationMessage> messages,
            boolean aggressive) {
        // Locate the boundary: index of the Nth-from-last assistant message
        // with tool calls. Tool results at or after it are considered recent.
        int rounds = 0;
        int boundary = 0;
        for (int i = messages.size() - 1; i >= 0; i--) {
            ConversationMessage msg = messages.get(i);
            if ("assistant".equals(msg.getRole())
                    && msg.getToolCalls() != null && !msg.getToolCalls().isEmpty()) {
                rounds++;
                if (rounds >= config.getEvictToolResultsAfterIterations()) {
                    boundary = i;
                    break;
                }
            }
        }
        if (boundary == 0) {
            return messages; // not enough rounds yet — nothing to evict
        }

        List<ConversationMessage> result = new ArrayList<>(messages.size());
        for (int i = 0; i < messages.size(); i++) {
            ConversationMessage msg = messages.get(i);
            boolean evictable = i < boundary
                    && "tool".equals(msg.getRole())
                    && msg.getContent() != null
                    && !msg.getContent().startsWith("[工具结果已淘汰")
                    && (aggressive || msg.getContent().length() > EVICT_MIN_CHARS);
            if (evictable) {
                String toolName = msg.getName() != null ? msg.getName() : "该工具";
                result.add(ConversationMessage.builder()
                        .role("tool")
                        .toolCallId(msg.getToolCallId())
                        .name(msg.getName())
                        .content(String.format(EVICTED_TEMPLATE, toolName))
                        .build());
            } else {
                result.add(msg);
            }
        }
        return result;
    }

    // ---- L2: LLM structured summary ----

    private Mono<List<ConversationMessage>> summarizeMiddle(AgentSession session,
            List<ConversationMessage> messages) {
        Segments seg = split(messages);
        if (seg.middle.isEmpty()) {
            // Nothing to summarize — recent window alone exceeds the budget;
            // hard truncation is the only remaining lever.
            return Mono.just(fallbackTruncate(messages));
        }

        String prompt = buildSummaryPrompt(session, seg);
        InferenceRequest request = InferenceRequest.builder()
                .model(session.getModelName())
                .messages(List.of(
                        ConversationMessage.system(
                                "你是一个上下文压缩助手，负责将 agent 的对话历史压缩为结构化任务状态摘要。"
                                        + "只输出摘要本身，不要输出任何额外解释。"),
                        ConversationMessage.user(prompt)))
                .toolChoice("none")
                .temperature(0.2)
                .maxTokens(2048)
                .stream(false)
                .build();

        return llmAdapter.infer(request)
                .map(response -> {
                    String summary = response.getContent();
                    if (summary == null || summary.isBlank()) {
                        throw new IllegalStateException("empty summary from LLM");
                    }
                    return assemble(seg, buildAnchorMessage(session, summary));
                });
    }

    private String buildSummaryPrompt(AgentSession session, Segments seg) {
        StringBuilder sb = new StringBuilder();
        sb.append("请将以下 agent 对话历史压缩为结构化任务状态摘要，固定使用如下模板：\n\n")
                .append("## 目标\n## 已完成步骤\n## 关键决策与事实（保留 ID、路径、名称等精确引用）\n")
                .append("## 待办\n## 注意事项\n\n");

        if (seg.previousSummary != null) {
            sb.append("=== 上一轮摘要（合并更新，不要丢失仍然有效的信息） ===\n")
                    .append(seg.previousSummary).append("\n\n");
        }
        String taskState = readTaskState(session);
        if (taskState != null && !taskState.isBlank()) {
            sb.append("=== Agent 自己维护的任务状态（权威，优先采信） ===\n")
                    .append(taskState).append("\n\n");
        }
        sb.append("=== 待压缩的对话片段 ===\n");
        for (ConversationMessage msg : seg.middle) {
            String content = msg.getContent() != null ? msg.getContent() : "";
            if (content.length() > SUMMARY_INPUT_MSG_MAX_CHARS) {
                content = content.substring(0, SUMMARY_INPUT_MSG_MAX_CHARS) + "…[截断]";
            }
            sb.append(msg.getRole());
            if (msg.getName() != null) {
                sb.append('(').append(msg.getName()).append(')');
            }
            sb.append(": ").append(content).append('\n');
            if (msg.getToolCalls() != null) {
                for (ConversationMessage.ToolCallInfo tc : msg.getToolCalls()) {
                    sb.append("  -> 调用工具 ").append(tc.getFunctionName()).append('\n');
                }
            }
        }
        return sb.toString();
    }

    private ConversationMessage buildAnchorMessage(AgentSession session, String summary) {
        StringBuilder content = new StringBuilder(SUMMARY_MARKER)
                .append("\n以下是较早对话内容的结构化摘要（原始消息已移除）：\n\n")
                .append(summary.trim());
        String taskState = readTaskState(session);
        if (taskState != null && !taskState.isBlank()) {
            content.append("\n\n=== Agent 维护的任务状态 ===\n").append(taskState);
        }
        return ConversationMessage.system(content.toString());
    }

    private String readTaskState(AgentSession session) {
        Object state = session.getMetadata().get(TASK_STATE_METADATA_KEY);
        return state != null ? state.toString() : null;
    }

    // ---- Fallback: aggressive eviction + hard truncation ----

    /**
     * Last-resort compaction when the summary LLM call fails: evict every
     * old tool result, then hard-truncate the middle segment with a
     * placeholder note.
     */
    List<ConversationMessage> fallbackTruncate(List<ConversationMessage> messages) {
        List<ConversationMessage> evicted = evictOldToolResults(messages, true);
        Segments seg = split(evicted);
        if (seg.middle.isEmpty()) {
            return evicted;
        }
        ConversationMessage placeholder = ConversationMessage.system(
                SUMMARY_MARKER + "\n[较早的 " + seg.middle.size()
                        + " 条对话消息因上下文超限被移除，摘要生成失败。"
                        + "请依据下方最近消息与任务状态继续推进任务。]");
        return assemble(seg, placeholder);
    }

    // ---- Segmentation helpers ----

    /**
     * Split messages into: leading system messages (system prompt etc.,
     * excluding a previous summary anchor), the middle segment, and the
     * {@code keepRecentMessages} most recent messages.
     */
    private Segments split(List<ConversationMessage> messages) {
        Segments seg = new Segments();
        int i = 0;
        while (i < messages.size() && "system".equals(messages.get(i).getRole())) {
            ConversationMessage msg = messages.get(i);
            if (msg.getContent() != null && msg.getContent().startsWith(SUMMARY_MARKER)) {
                seg.previousSummary = msg.getContent().substring(SUMMARY_MARKER.length()).trim();
            } else {
                seg.head.add(msg);
            }
            i++;
        }
        int recentStart = Math.max(i, messages.size() - config.getKeepRecentMessages());
        seg.middle.addAll(messages.subList(i, recentStart));
        seg.recent.addAll(messages.subList(recentStart, messages.size()));
        return seg;
    }

    /** Rebuild the message list: head + anchor + recent (orphans re-cleaned). */
    private List<ConversationMessage> assemble(Segments seg, ConversationMessage anchor) {
        List<ConversationMessage> result = new ArrayList<>(seg.head);
        result.add(anchor);
        result.addAll(seg.recent);
        // The recent-window cut may have split an assistant tool_calls group.
        return cleanupOrphanedToolMessages(result);
    }

    private static class Segments {
        final List<ConversationMessage> head = new ArrayList<>();
        final List<ConversationMessage> middle = new ArrayList<>();
        final List<ConversationMessage> recent = new ArrayList<>();
        String previousSummary;
    }

    // ---- Orphaned tool-message cleanup (migrated from V1 ContextManager) ----

    /**
     * Enforce assistant-tool_calls/tool-result pairing integrity:
     * <ul>
     * <li>Pass 1: drop tool messages whose {@code tool_call_id} has no
     * matching pending call from the preceding assistant message.</li>
     * <li>Pass 2: assistant messages whose tool calls were not ALL answered
     * are rebuilt without {@code tool_calls} (kept if they still carry
     * content, dropped otherwise), and their partial results removed.</li>
     * </ul>
     * Providers like DeepSeek return HTTP 400 on violations of this pairing.
     */
    public List<ConversationMessage> cleanupOrphanedToolMessages(List<ConversationMessage> messages) {
        // Pass 1: remove tool results without a matching open call
        List<ConversationMessage> pass1 = new ArrayList<>(messages.size());
        Set<String> openCallIds = new HashSet<>();
        for (ConversationMessage msg : messages) {
            if ("assistant".equals(msg.getRole())) {
                openCallIds.clear();
                if (msg.getToolCalls() != null) {
                    for (ConversationMessage.ToolCallInfo tc : msg.getToolCalls()) {
                        openCallIds.add(tc.getId());
                    }
                }
                pass1.add(msg);
            } else if ("tool".equals(msg.getRole())) {
                if (msg.getToolCallId() != null && openCallIds.remove(msg.getToolCallId())) {
                    pass1.add(msg);
                } else {
                    log.debug("ContextCompactor: dropping orphaned tool result (id={})",
                            msg.getToolCallId());
                }
            } else {
                openCallIds.clear();
                pass1.add(msg);
            }
        }

        // Pass 2: neutralize assistant tool_calls groups with incomplete results
        List<ConversationMessage> pass2 = new ArrayList<>(pass1.size());
        for (int i = 0; i < pass1.size(); i++) {
            ConversationMessage msg = pass1.get(i);
            if (!"assistant".equals(msg.getRole())
                    || msg.getToolCalls() == null || msg.getToolCalls().isEmpty()) {
                pass2.add(msg);
                continue;
            }
            Set<String> expected = new HashSet<>();
            for (ConversationMessage.ToolCallInfo tc : msg.getToolCalls()) {
                expected.add(tc.getId());
            }
            int j = i + 1;
            while (j < pass1.size() && "tool".equals(pass1.get(j).getRole())) {
                expected.remove(pass1.get(j).getToolCallId());
                j++;
            }
            if (expected.isEmpty()) {
                pass2.add(msg); // complete group — keep as is
            } else {
                log.debug("ContextCompactor: assistant tool_calls group incomplete ({} unanswered), rebuilding",
                        expected.size());
                boolean hasText = msg.getContent() != null && !msg.getContent().isBlank();
                if (hasText) {
                    pass2.add(ConversationMessage.builder()
                            .role("assistant")
                            .content(msg.getContent())
                            .reasoningContent(msg.getReasoningContent())
                            .build());
                }
                i = j - 1; // skip the partial tool results
            }
        }
        return pass2;
    }

    // ---- Tool-result write governance ----

    /**
     * Truncate a tool result before it is written into the conversation
     * history. The SSE event sent to the frontend keeps the full result;
     * only the LLM-visible message is capped.
     */
    public static String truncateToolResult(String content, int maxChars) {
        if (content == null || maxChars <= 0 || content.length() <= maxChars) {
            return content;
        }
        return content.substring(0, maxChars)
                + "\n[已截断，原始长度 " + content.length() + " 字符]";
    }

    // ---- Token estimation ----

    /** Rough estimate: total chars / 4 (used only before real usage arrives). */
    public int estimateTokens(List<ConversationMessage> messages) {
        long chars = 0;
        for (ConversationMessage msg : messages) {
            if (msg.getContent() != null) {
                chars += msg.getContent().length();
            }
            if (msg.getReasoningContent() != null) {
                chars += msg.getReasoningContent().length();
            }
            if (msg.getToolCalls() != null) {
                for (ConversationMessage.ToolCallInfo tc : msg.getToolCalls()) {
                    if (tc.getFunctionArguments() != null) {
                        chars += tc.getFunctionArguments().length();
                    }
                }
            }
        }
        return (int) (chars / 4);
    }

    /**
     * Ratio between the provider-reported token count and our chars/4
     * estimate for the same message list — corrects the estimator for
     * CJK-heavy content where chars/4 badly undercounts.
     */
    private double calibrationRatio(int lastPromptTokens, List<ConversationMessage> messages) {
        if (lastPromptTokens <= 0) {
            return 1.0;
        }
        int estimate = estimateTokens(messages);
        if (estimate <= 0) {
            return 1.0;
        }
        return Math.max(1.0, (double) lastPromptTokens / estimate);
    }
}
