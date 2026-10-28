package com.knowledge.agent.core.memory;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.checkpoint.CheckpointStore;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.context.ContextManager;
import com.knowledge.agent.core.entity.AgentThreadEntity;
import com.knowledge.agent.core.llm.LlmGateway;
import com.knowledge.agent.core.llm.LlmInferRequest;
import com.knowledge.agent.core.llm.LlmResult;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.run.RunStore;
import com.knowledge.agent.core.supervisor.ThreadStore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Conversation (session) memory: when a run completes, roll the run's tail
 * into the thread summary asynchronously (first run: plain summary; later
 * runs: merge with the existing summary) and persist it on the thread — the
 * next run in the same conversation injects the rolling summary into its
 * system prompt.
 */
@Slf4j
@Component
public class ThreadSummarizer {

    private static final String FIRST_SUMMARY_SYSTEM =
            "你负责为一段对话生成简短的会话记忆。用 1-2 句话概括：用户的目标、已完成的工作、"
                    + "未完成的事项与重要约束。直接输出概括内容，不要任何前缀。";

    private static final String ROLLING_SUMMARY_SYSTEM =
            "你负责持续维护一段对话的“会话记忆”摘要。请把【最近一段对话】并入【已有摘要】，"
                    + "输出更新后的完整摘要：用户目标、已完成工作、未完成事项、重要约束，共 2-4 句话。"
                    + "保留仍然有效的信息，吸收新进展，删除已被推翻或已过时的内容。直接输出摘要，不要任何前缀。";

    private final ThreadStore threadStore;
    private final CheckpointStore checkpointStore;
    private final LlmGateway llmGateway;
    /** Optional (tests); when present, summary token usage is billed to the run. */
    private final RunStore runStore;
    private final AgentCoreProperties properties;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "agentcore-thread-summary");
        t.setDaemon(true);
        return t;
    });

    public ThreadSummarizer(ThreadStore threadStore, CheckpointStore checkpointStore,
                            LlmGateway llmGateway) {
        this(threadStore, checkpointStore, llmGateway, null, new AgentCoreProperties());
    }

    @Autowired
    public ThreadSummarizer(ThreadStore threadStore, CheckpointStore checkpointStore,
                            LlmGateway llmGateway, RunStore runStore,
                            AgentCoreProperties properties) {
        this.threadStore = threadStore;
        this.checkpointStore = checkpointStore;
        this.llmGateway = llmGateway;
        this.runStore = runStore;
        this.properties = properties;
    }

    /** Fire-and-forget rolling summary update for a completed run. */
    public void summarizeAsync(String runId, String conversationId, String model) {
        executor.submit(() -> {
            try {
                Checkpoint checkpoint = checkpointStore.load(runId);
                if (checkpoint == null) {
                    return;
                }
                // Read the freshest summary inside the task: a concurrent run
                // creation must never be overwritten with stale context.
                AgentThreadEntity thread = threadStore.get(conversationId);
                String previous = thread != null ? thread.getSummary() : null;
                LlmResult result = generateSummary(checkpoint, model, previous);
                String summary = result != null ? result.getText() : null;
                if (summary != null && !summary.trim().isEmpty()) {
                    // Compare-and-set on the summary we summarized from: a
                    // concurrent "clear chat" must not be undone by this
                    // in-flight task writing the old conversation back.
                    threadStore.updateSummaryIfUnchanged(conversationId, previous, summary.trim());
                }
                // Side-channel LLM calls must be visible to cost accounting.
                accountUsage(runId, result);
            } catch (Exception e) {
                log.warn("Thread summary failed for {}: {}", runId, e.getMessage());
            }
        });
    }

    /** Title from the first user message (no LLM call needed). */
    public static String titleFrom(List<ChatMessage> messages) {
        if (messages == null) {
            return null;
        }
        for (ChatMessage message : messages) {
            if ("user".equalsIgnoreCase(message.getRole()) && message.getContent() != null
                    && !message.getContent().trim().isEmpty()) {
                String content = message.getContent().trim().replaceAll("\\s+", " ");
                return content.length() > 30 ? content.substring(0, 30) : content;
            }
        }
        return null;
    }

    private void accountUsage(String runId, LlmResult result) {
        if (runStore == null || result == null) {
            return;
        }
        if (result.getPromptTokens() <= 0 && result.getCompletionTokens() <= 0) {
            return;
        }
        try {
            AgentRun run = runStore.load(runId);
            if (run == null) {
                return;
            }
            run.setPromptTokens(run.getPromptTokens() + result.getPromptTokens());
            run.setCompletionTokens(run.getCompletionTokens() + result.getCompletionTokens());
            run.setCachedPromptTokens(run.getCachedPromptTokens() + result.getCachedPromptTokens());
            run.touch();
            runStore.persist(run);
            runStore.saveHot(run);
        } catch (Exception e) {
            log.warn("Thread summary usage accounting failed for {}: {}", runId, e.getMessage());
        }
    }

    private LlmResult generateSummary(Checkpoint checkpoint, String model, String previousSummary) {
        List<ChatMessage> messages = checkpoint.getMessages() != null
                ? checkpoint.getMessages() : Collections.emptyList();
        List<ChatMessage> tail = tailOf(messages);

        boolean rolling = previousSummary != null && !previousSummary.trim().isEmpty();
        List<ChatMessage> prompt = new ArrayList<>();
        prompt.add(ChatMessage.builder().role("system")
                .content(rolling ? ROLLING_SUMMARY_SYSTEM : FIRST_SUMMARY_SYSTEM).build());
        StringBuilder user = new StringBuilder();
        if (rolling) {
            user.append("【已有摘要】\\n").append(previousSummary.trim()).append("\\n\\n");
        }
        user.append("【最近一段对话】\\n").append(renderConversation(tail));
        prompt.add(ChatMessage.builder().role("user").content(user.toString()).build());

        LlmResult result = llmGateway.infer(LlmInferRequest.builder()
                .model(model)
                .messages(prompt)
                .temperature(0.0)
                .maxTokens(256)
                .build());
        return result;
    }

    /**
     * The window this summary is built from: the trailing messages, moved forward
     * past any tool result whose call falls outside it.
     *
     * <p>The window used to be a hard-coded 12 messages, which for a run with a
     * long tool loop describes the middle of the work instead of its outcome. It
     * also could start on a tool result whose assistant call sat outside it, which
     * reads to the summarizer as an answer to a question nobody asked.
     */
    private List<ChatMessage> tailOf(List<ChatMessage> messages) {
        int size = messages.size();
        int tailMessages = Math.max(1, properties.getContext().getThreadSummaryTailMessages());
        int from = Math.max(1, size - tailMessages);
        while (from < size - 1 && "tool".equalsIgnoreCase(messages.get(from).getRole())) {
            from++;
        }
        return new ArrayList<>(messages.subList(from, size));
    }

    /**
     * The tail as the summarizer reads it. Shares
     * {@link ContextManager#renderForSummary} with L2: the same head+tail clip and
     * the same tool-call names, so an action is described the same way by both
     * summary tiers.
     */
    private String renderConversation(List<ChatMessage> messages) {
        int maxChars = Math.max(200, properties.getContext().getThreadSummaryMessageMaxChars());
        StringBuilder builder = new StringBuilder();
        for (ChatMessage message : messages) {
            // Injected context blocks are per-turn scaffolding, and an engine-authored
            // user turn (the truncation nudge) is not something the user asked for.
            if (message == null || ContextManager.isInjectedContext(message)
                    || ContextManager.isEngineAuthoredUserTurn(message)) {
                continue;
            }
            builder.append(ContextManager.renderForSummary(message, maxChars)).append('\n');
        }
        return builder.toString();
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
    }
}
