package com.knowledge.agentcore.memory;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agentcore.checkpoint.Checkpoint;
import com.knowledge.agentcore.checkpoint.CheckpointStore;
import com.knowledge.agentcore.llm.LlmGateway;
import com.knowledge.agentcore.llm.LlmInferRequest;
import com.knowledge.agentcore.llm.LlmResult;
import com.knowledge.agentcore.supervisor.ThreadStore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Conversation (session) memory: when a run completes, generate a short
 * summary of the conversation asynchronously and persist it on the thread —
 * the next run in the same conversation injects it into its system prompt.
 */
@Slf4j
@Component
public class ThreadSummarizer {

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

    /** Fire-and-forget summary generation for a completed run. */
    public void summarizeAsync(String runId, String conversationId, String model) {
        executor.submit(() -> {
            try {
                Checkpoint checkpoint = checkpointStore.load(runId);
                if (checkpoint == null) {
                    return;
                }
                String summary = generateSummary(checkpoint, model);
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

    private String generateSummary(Checkpoint checkpoint, String model) {
        List<ChatMessage> messages = checkpoint.getMessages() != null
                ? checkpoint.getMessages() : Collections.emptyList();
        // Take the tail (last 12 messages) as the summarization source.
        int from = Math.max(1, messages.size() - 12);
        List<ChatMessage> tail = new ArrayList<>(messages.subList(from, messages.size()));

        List<ChatMessage> prompt = new ArrayList<>();
        prompt.add(ChatMessage.builder().role("system")
                .content("你负责为一段对话生成简短的会话记忆。用 1-2 句话概括：用户的目标、已完成的工作、"
                        + "未完成的事项与重要约束。直接输出概括内容，不要任何前缀。").build());
        prompt.add(ChatMessage.builder().role("user")
                .content(renderConversation(tail)).build());

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
