package com.knowledge.agent.harness;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.llm.LlmClient;
import com.knowledge.agent.llm.LlmClientFactory;
import com.knowledge.agent.llm.LlmRequest;
import com.knowledge.agent.llm.LlmResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Tracks estimated token usage across the conversation and applies
 * compression when nearing limits.
 *
 * <p>
 * <b>Improvements:</b>
 * <ul>
 * <li>Incremental token tracking: tokens are estimated once per message
 *     and cached, avoiding O(n) re-estimation on every loop iteration</li>
 * <li>Summarize strategy: when enabled, uses an LLM call to condense
 *     older messages into a single summary instead of deleting them</li>
 * </ul>
 */
@Slf4j
@Component
public class ContextManager {

    @Value("${agent.context.max-tokens:32768}")
    private int maxTokens;

    @Value("${agent.context.compression-threshold:0.75}")
    private double compressionThreshold;

    @Value("${agent.context.strategy:truncate}")
    private String strategy;

    /**
     * The LLM client factory used by the summarize strategy.
     * Injected lazily to avoid circular dependency issues.
     */
    private volatile LlmClientFactory llmClientFactory;

    // Incremental token tracking
    private int cachedTokenCount = 0;
    private int lastKnownMessageCount = 0;

    /**
     * Set the LLM client factory for the summarize strategy.
     * Called by the framework after construction to avoid circular deps.
     */
    public void setLlmClientFactory(LlmClientFactory factory) {
        this.llmClientFactory = factory;
    }

    /**
     * Estimate token count for a list of messages.
     * Simple heuristic: ~4 characters per token.
     */
    public int estimateTokens(List<ChatMessage> messages) {
        if (messages == null) {
            return 0;
        }
        int total = 0;
        for (ChatMessage msg : messages) {
            if (msg.getContent() != null) {
                total += msg.getContent().length() / 4;
            }
        }
        return total;
    }

    /**
     * Get the current estimated token count, using incremental tracking
     * when possible.
     *
     * @param messages the current conversation history
     * @return estimated token count
     */
    private int getEstimatedTokens(List<ChatMessage> messages) {
        if (messages.size() == lastKnownMessageCount) {
            return cachedTokenCount;
        }
        // If messages were added (not removed), compute incrementally
        if (messages.size() > lastKnownMessageCount && lastKnownMessageCount >= 0) {
            for (int i = lastKnownMessageCount; i < messages.size(); i++) {
                ChatMessage msg = messages.get(i);
                if (msg.getContent() != null) {
                    cachedTokenCount += msg.getContent().length() / 4;
                }
            }
            lastKnownMessageCount = messages.size();
            return cachedTokenCount;
        }
        // Messages were removed (compression) — re-estimate from scratch
        cachedTokenCount = estimateTokens(messages);
        lastKnownMessageCount = messages.size();
        return cachedTokenCount;
    }

    /**
     * Compress context if needed.
     * When usage exceeds compressionThreshold * maxTokens, applies the configured
     * strategy.
     *
     * @param messages the conversation history (modified in place)
     * @return true if compression was applied
     */
    public boolean compressIfNeeded(List<ChatMessage> messages) {
        int estimated = getEstimatedTokens(messages);
        int threshold = (int) (maxTokens * compressionThreshold);

        if (estimated < threshold) {
            return false;
        }

        log.info("Context compression triggered: estimated={} tokens, threshold={}", estimated, threshold);

        if ("truncate".equals(strategy)) {
            return truncate(messages);
        } else if ("summarize".equals(strategy)) {
            return summarize(messages);
        }

        return false;
    }

    /**
     * Truncate strategy: remove oldest messages beyond a sliding window.
     * Keeps the system message (if any) and the most recent messages.
     * Also ensures assistant+tool_calls and tool messages are kept together —
     * DeepSeek API returns 400 if a tool message is not preceded by an assistant
     * message with tool_calls.
     */
    private boolean truncate(List<ChatMessage> messages) {
        if (messages.size() <= 2) {
            return false;
        }

        // Keep system message (first) and last N messages
        int keepCount = Math.max(2, messages.size() / 2);
        int removeCount = messages.size() - keepCount - (messages.get(0).getRole().equals("system") ? 1 : 0);

        if (removeCount > 0) {
            int startIdx = messages.get(0).getRole().equals("system") ? 1 : 0;
            for (int i = 0; i < removeCount && startIdx < messages.size() - 1; i++) {
                messages.remove(startIdx);
            }

            // Fix up: ensure no orphaned tool messages remain after truncation.
            cleanupOrphanedToolMessages(messages);

            // Invalidate incremental cache — messages were modified
            cachedTokenCount = estimateTokens(messages);
            lastKnownMessageCount = messages.size();

            log.info("Truncated context: removed {} messages, {} remaining", removeCount, messages.size());
            return true;
        }

        return false;
    }

    /**
     * Summarize strategy: replace older messages with an LLM-generated summary.
     *
     * <p>
     * Keeps the system message, replaces the oldest non-system messages with a
     * single "system" message containing the summary, and preserves the most
     * recent messages for continuity.
     *
     * <p>
     * Falls back to truncate if the LLM call fails.
     */
    private boolean summarize(List<ChatMessage> messages) {
        if (messages.size() <= 4) {
            // Too few messages to meaningfully summarize
            return false;
        }

        LlmClientFactory factory = this.llmClientFactory;
        if (factory == null) {
            log.warn("Summarize strategy: LlmClientFactory not set, falling back to truncate");
            return truncate(messages);
        }

        try {
            // Determine the split point: keep system + last ~4 messages
            int systemCount = messages.get(0).getRole().equals("system") ? 1 : 0;
            int keepRecent = 4;
            int summarizeEnd = messages.size() - keepRecent;

            if (summarizeEnd <= systemCount) {
                return false;
            }

            // Collect messages to summarize (skip system message)
            List<ChatMessage> toSummarize = new ArrayList<>(
                    messages.subList(systemCount, summarizeEnd));

            // Build a summarization prompt
            StringBuilder summaryPrompt = new StringBuilder();
            summaryPrompt.append("Summarize the following conversation history concisely. ");
            summaryPrompt.append("Preserve key facts, decisions, tool results, and any important context. ");
            summaryPrompt.append("Do not include pleasantries or filler. ");
            summaryPrompt.append("Format as bullet points.\n\n");
            summaryPrompt.append("--- CONVERSATION ---\n");
            for (ChatMessage msg : toSummarize) {
                String role = msg.getRole();
                String content = msg.getContent();
                if (content != null && !content.isEmpty()) {
                    summaryPrompt.append(role).append(": ").append(content).append("\n");
                }
            }
            summaryPrompt.append("--- END CONVERSATION ---\n\nSummary:");

            // Call LLM for summarization (using default model)
            LlmClient client = factory.getClientForModel(null);
            ChatMessage sysMsg = ChatMessage.builder()
                    .role("system")
                    .content("You are a conversation summarizer. Be concise and factual.")
                    .build();
            ChatMessage userMsg = ChatMessage.builder()
                    .role("user")
                    .content(summaryPrompt.toString())
                    .build();

            LlmRequest req = LlmRequest.builder()
                    .model(null)
                    .temperature(0)
                    .maxTokens(512)
                    .messages(java.util.Arrays.asList(sysMsg, userMsg))
                    .stream(false)
                    .build();

            LlmResponse resp = client.chat(req);
            if (resp == null || resp.getContent() == null || resp.getContent().isEmpty()) {
                log.warn("Summarize strategy: empty LLM response, falling back to truncate");
                return truncate(messages);
            }

            // Replace summarized messages with a single summary message
            String summaryContent = "Previous conversation summary:\n" + resp.getContent();
            ChatMessage summaryMessage = ChatMessage.builder()
                    .role("system")
                    .content(summaryContent)
                    .build();

            // Remove the old messages and insert the summary
            for (int i = summarizeEnd - 1; i >= systemCount; i--) {
                messages.remove(i);
            }
            messages.add(systemCount, summaryMessage);

            // Clean up any orphaned tool messages
            cleanupOrphanedToolMessages(messages);

            // Invalidate incremental cache
            cachedTokenCount = estimateTokens(messages);
            lastKnownMessageCount = messages.size();

            log.info("Summarized context: replaced {} messages with summary, {} remaining",
                    toSummarize.size(), messages.size());
            return true;

        } catch (Exception e) {
            log.warn("Summarize strategy failed, falling back to truncate: {}", e.getMessage());
            return truncate(messages);
        }
    }

    /**
     * Clean up orphaned tool messages and incomplete assistant+tool_calls groups.
     * Shared by both truncate and summarize strategies.
     */
    private void cleanupOrphanedToolMessages(List<ChatMessage> messages) {
        // Remove orphaned tool messages (no preceding assistant+tool_calls)
        for (int i = messages.size() - 1; i >= 0; i--) {
            ChatMessage msg = messages.get(i);
            if ("tool".equals(msg.getRole())) {
                boolean hasAssistantWithToolCalls = false;
                for (int j = i - 1; j >= 0; j--) {
                    ChatMessage preceding = messages.get(j);
                    if ("tool".equals(preceding.getRole())) {
                        continue; // sibling in the same group, keep looking
                    }
                    if ("assistant".equals(preceding.getRole())
                            && preceding.getToolCalls() != null
                            && !preceding.getToolCalls().isEmpty()) {
                        hasAssistantWithToolCalls = true;
                    }
                    break;
                }
                if (!hasAssistantWithToolCalls) {
                    messages.remove(i);
                    log.debug("Removed orphaned tool message at index {} during cleanup", i);
                }
            }
        }

        // Remove assistant messages with tool_calls whose tool results
        // were partially or fully removed. DeepSeek API requires that every
        // tool_call_id in an assistant+tool_calls message has a corresponding
        // tool result message.
        for (int i = messages.size() - 1; i >= 0; i--) {
            ChatMessage msg = messages.get(i);
            if ("assistant".equals(msg.getRole())
                    && msg.getToolCalls() != null && !msg.getToolCalls().isEmpty()) {
                // Collect expected tool_call_ids
                Set<String> expectedIds = new java.util.HashSet<>();
                for (ChatMessage.ToolCallInfo tc : msg.getToolCalls()) {
                    if (tc.getId() != null) {
                        expectedIds.add(tc.getId());
                    }
                }

                // Collect tool_call_ids from subsequent tool messages
                Set<String> foundIds = new java.util.HashSet<>();
                int j = i + 1;
                while (j < messages.size() && "tool".equals(messages.get(j).getRole())) {
                    ChatMessage toolMsg = messages.get(j);
                    if (toolMsg.getToolCallId() != null) {
                        foundIds.add(toolMsg.getToolCallId());
                    }
                    j++;
                }

                // If any tool_call_ids are missing their results, remove the
                // entire group (assistant + all tool results)
                if (!foundIds.containsAll(expectedIds)) {
                    for (int k = j - 1; k > i; k--) {
                        messages.remove(k);
                        log.debug("Removed tool message at index {} during incomplete group cleanup", k);
                    }
                    messages.remove(i);
                    log.debug("Removed assistant+tool_calls message at index {} with incomplete tool results", i);
                }
            }
        }
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public double getCompressionThreshold() {
        return compressionThreshold;
    }

    public String getStrategy() {
        return strategy;
    }
}
