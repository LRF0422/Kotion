package com.knowledge.agent.core.memory;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.checkpoint.CheckpointStore;
import com.knowledge.agent.core.entity.AgentThreadEntity;
import com.knowledge.agent.core.llm.LlmGateway;
import com.knowledge.agent.core.llm.LlmInferRequest;
import com.knowledge.agent.core.llm.LlmResult;
import com.knowledge.agent.core.supervisor.ThreadStore;
import lombok.extern.slf4j.Slf4j;
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
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "agentcore-thread-summary");
        t.setDaemon(true);
        return t;
    });

    public ThreadSummarizer(ThreadStore threadStore, CheckpointStore checkpointStore,
                            LlmGateway llmGateway) {
        this.threadStore = threadStore;
        this.checkpointStore = checkpointStore;
        this.llmGateway = llmGateway;
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
                String summary = generateSummary(checkpoint, model, previous);
                if (summary != null && !summary.trim().isEmpty()) {
                    threadStore.updateMeta(conversationId, null, summary.trim());
                }
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

    private String generateSummary(Checkpoint checkpoint, String model, String previousSummary) {
        List<ChatMessage> messages = checkpoint.getMessages() != null
                ? checkpoint.getMessages() : Collections.emptyList();
        // Take the tail (last 12 messages) as the summarization source.
        int from = Math.max(1, messages.size() - 12);
        List<ChatMessage> tail = new ArrayList<>(messages.subList(from, messages.size()));

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
        return result.getText();
    }

    private String renderConversation(List<ChatMessage> messages) {
        StringBuilder builder = new StringBuilder();
        for (ChatMessage message : messages) {
            if (message == null) {
                continue;
            }
            builder.append("[").append(message.getRole()).append("] ");
            if (message.getContent() != null) {
                String content = message.getContent();
                builder.append(content.length() > 500 ? content.substring(0, 500) : content);
            }
            builder.append("\n");
        }
        return builder.toString();
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
    }
}
