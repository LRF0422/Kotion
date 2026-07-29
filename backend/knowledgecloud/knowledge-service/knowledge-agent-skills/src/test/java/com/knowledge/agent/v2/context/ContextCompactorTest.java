package com.knowledge.agent.v2.context;

import com.knowledge.agent.v2.config.AgentProperties;
import com.knowledge.agent.v2.llm.InferenceRequest;
import com.knowledge.agent.v2.llm.InferenceResponse;
import com.knowledge.agent.v2.llm.LlmAdapter;
import com.knowledge.agent.v2.llm.LlmChunk;
import com.knowledge.agent.v2.llm.ModelCapabilities;
import com.knowledge.agent.v2.session.AgentSession;
import com.knowledge.agent.v2.session.ConversationMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link ContextCompactor}: L1 tool-result eviction, L2 summary
 * anchoring/merging, orphaned tool-message cleanup, and the LLM-failure
 * fallback.
 */
class ContextCompactorTest {

    /**
     * Adapter stub: records the last request and replies with a configurable Mono.
     */
    private static class StubLlmAdapter implements LlmAdapter {
        InferenceRequest lastRequest;
        int inferCalls;
        Mono<InferenceResponse> response = Mono.error(new IllegalStateException("no response configured"));

        @Override
        public Flux<LlmChunk> streamInfer(InferenceRequest request) {
            return Flux.error(new UnsupportedOperationException("not used in tests"));
        }

        @Override
        public Mono<InferenceResponse> infer(InferenceRequest request) {
            this.lastRequest = request;
            this.inferCalls++;
            return response;
        }

        @Override
        public ModelCapabilities capabilities() {
            return null;
        }
    }

    private AgentProperties.ContextConfig config;
    private StubLlmAdapter llm;
    private ContextCompactor compactor;

    @BeforeEach
    void setUp() {
        config = new AgentProperties.ContextConfig();
        config.setMaxContextTokens(1000); // threshold = 750 tokens = 3000 chars
        config.setCompactionThreshold(0.75);
        config.setKeepRecentMessages(4);
        config.setToolResultMaxChars(100);
        config.setEvictToolResultsAfterIterations(2);
        llm = new StubLlmAdapter();
        compactor = new ContextCompactor(config, llm);
    }

    // ---- Helpers ----

    private static String repeat(char c, int n) {
        char[] chars = new char[n];
        Arrays.fill(chars, c);
        return new String(chars);
    }

    private static ConversationMessage assistantWithCall(String callId, String toolName) {
        return ConversationMessage.builder()
                .role("assistant")
                .content("calling " + toolName)
                .toolCalls(Collections.singletonList(
                        new ConversationMessage.ToolCallInfo(callId, "function", toolName, "{}")))
                .build();
    }

    private static AgentSession sessionWith(List<ConversationMessage> messages) {
        AgentSession session = AgentSession.builder()
                .sessionId("test-session")
                .modelName("test-model")
                .build();
        session.getExecution().setMessages(messages);
        return session;
    }

    /** Three tool-call rounds; round 1's result is bulky, rounds 2-3 are recent. */
    private List<ConversationMessage> threeRounds(int oldResultChars) {
        List<ConversationMessage> messages = new ArrayList<>();
        messages.add(ConversationMessage.system("system prompt"));
        messages.add(ConversationMessage.user("do the task"));
        messages.add(assistantWithCall("c1", "web_search"));
        messages.add(ConversationMessage.toolResult("c1", "web_search", repeat('a', oldResultChars)));
        messages.add(assistantWithCall("c2", "web_fetch"));
        messages.add(ConversationMessage.toolResult("c2", "web_fetch", repeat('b', 600)));
        messages.add(assistantWithCall("c3", "dataset_search"));
        messages.add(ConversationMessage.toolResult("c3", "dataset_search", repeat('c', 600)));
        messages.add(ConversationMessage.assistant("almost done"));
        return messages;
    }

    // ---- shouldCompact ----

    @Test
    void shouldCompactUsesRealPromptTokensWhenAvailable() {
        AgentSession session = sessionWith(new ArrayList<>(
                Collections.singletonList(ConversationMessage.user("hi"))));
        session.getExecution().setLastPromptTokens(751);
        assertThat(compactor.shouldCompact(session)).isTrue();

        session.getExecution().setLastPromptTokens(750);
        assertThat(compactor.shouldCompact(session)).isFalse();
    }

    @Test
    void shouldCompactFallsBackToCharEstimateBeforeFirstUsage() {
        // No usage report yet (lastPromptTokens == 0) → chars/4 estimate.
        AgentSession small = sessionWith(new ArrayList<>(
                Collections.singletonList(ConversationMessage.user(repeat('x', 400)))));
        assertThat(compactor.shouldCompact(small)).isFalse();

        AgentSession big = sessionWith(new ArrayList<>(
                Collections.singletonList(ConversationMessage.user(repeat('x', 4000)))));
        assertThat(compactor.shouldCompact(big)).isTrue();
    }

    // ---- L1: evictOldToolResults ----

    @Test
    void l1EvictsBulkyToolResultsBeforeBoundaryOnly() {
        List<ConversationMessage> messages = threeRounds(600);
        List<ConversationMessage> result = compactor.evictOldToolResults(messages, false);

        // Round 1 result (before the 2nd-from-last tool-call round) is evicted…
        ConversationMessage evicted = result.get(3);
        assertThat(evicted.getRole()).isEqualTo("tool");
        assertThat(evicted.getToolCallId()).isEqualTo("c1");
        assertThat(evicted.getContent()).contains("工具结果已淘汰").contains("web_search");
        // …while recent rounds keep their full results.
        assertThat(result.get(5).getContent()).isEqualTo(repeat('b', 600));
        assertThat(result.get(7).getContent()).isEqualTo(repeat('c', 600));
        // Assistant reasoning messages are untouched.
        assertThat(result.get(2).getContent()).isEqualTo("calling web_search");
    }

    @Test
    void l1KeepsSmallToolResultsUnlessAggressive() {
        List<ConversationMessage> messages = threeRounds(100); // below EVICT_MIN_CHARS
        List<ConversationMessage> lenient = compactor.evictOldToolResults(messages, false);
        assertThat(lenient.get(3).getContent()).isEqualTo(repeat('a', 100));

        List<ConversationMessage> aggressive = compactor.evictOldToolResults(messages, true);
        assertThat(aggressive.get(3).getContent()).contains("工具结果已淘汰");
    }

    @Test
    void l1IsNoOpWhenNotEnoughToolCallRounds() {
        List<ConversationMessage> messages = new ArrayList<>();
        messages.add(ConversationMessage.user("task"));
        messages.add(assistantWithCall("c1", "web_search"));
        messages.add(ConversationMessage.toolResult("c1", "web_search", repeat('a', 900)));
        // Only one round < evictToolResultsAfterIterations(2) → unchanged.
        assertThat(compactor.evictOldToolResults(messages, false)).isSameAs(messages);
    }

    // ---- compact(): L1-sufficient path ----

    @Test
    void compactStopsAfterL1WhenBackUnderThreshold() {
        // One huge old tool result dominates; evicting it drops the estimate
        // below the 750-token threshold, so the LLM must not be called.
        List<ConversationMessage> messages = threeRounds(20000);
        AgentSession session = sessionWith(messages);

        List<ConversationMessage> result = compactor.compact(session).block();

        assertThat(result).isNotNull();
        assertThat(result.get(3).getContent()).contains("工具结果已淘汰");
        assertThat(llm.inferCalls).isZero();
    }

    // ---- compact(): L2 summary anchoring & merge ----

    private List<ConversationMessage> longConversation() {
        // Bulky content spread over MANY messages so that L1 alone cannot
        // save us and a non-empty middle segment exists.
        List<ConversationMessage> messages = new ArrayList<>();
        messages.add(ConversationMessage.system("system prompt"));
        messages.add(ConversationMessage.user("do the big task"));
        for (int i = 0; i < 10; i++) {
            messages.add(ConversationMessage.assistant("step " + i + ": " + repeat('x', 1500)));
        }
        return messages;
    }

    @Test
    void l2AnchorsSingleSummaryMessageAfterSystemPrompt() {
        AgentSession session = sessionWith(longConversation());
        session.getMetadata().put(ContextCompactor.TASK_STATE_METADATA_KEY, "goal: finish X");
        llm.response = Mono.just(InferenceResponse.builder().content("STRUCTURED-SUMMARY").build());

        List<ConversationMessage> result = compactor.compact(session).block();

        assertThat(result).isNotNull();
        assertThat(llm.inferCalls).isEqualTo(1);
        // head (system prompt) + anchor + 4 recent messages
        assertThat(result.get(0).getContent()).isEqualTo("system prompt");
        ConversationMessage anchor = result.get(1);
        assertThat(anchor.getRole()).isEqualTo("system");
        assertThat(anchor.getContent())
                .startsWith(ContextCompactor.SUMMARY_MARKER)
                .contains("STRUCTURED-SUMMARY")
                .contains("goal: finish X"); // scratchpad task state merged in
        assertThat(result).hasSize(2 + config.getKeepRecentMessages());
        // Recent window preserved verbatim
        assertThat(result.get(result.size() - 1).getContent()).startsWith("step 9");
        // Single-anchor invariant
        long anchors = result.stream()
                .filter(m -> m.getContent() != null
                        && m.getContent().startsWith(ContextCompactor.SUMMARY_MARKER))
                .count();
        assertThat(anchors).isEqualTo(1);
    }

    @Test
    void l2MergesPreviousAnchorInsteadOfStacking() {
        List<ConversationMessage> messages = longConversation();
        // Simulate an earlier compaction: anchor sits right after the system prompt.
        messages.add(1, ConversationMessage.system(
                ContextCompactor.SUMMARY_MARKER + "\nOLD-SUMMARY-CONTENT"));
        AgentSession session = sessionWith(messages);
        llm.response = Mono.just(InferenceResponse.builder().content("NEW-SUMMARY").build());

        List<ConversationMessage> result = compactor.compact(session).block();

        assertThat(result).isNotNull();
        long anchors = result.stream()
                .filter(m -> m.getContent() != null
                        && m.getContent().startsWith(ContextCompactor.SUMMARY_MARKER))
                .count();
        assertThat(anchors).isEqualTo(1);
        assertThat(result.get(1).getContent()).contains("NEW-SUMMARY");
        // The previous summary was fed to the LLM for merging.
        String prompt = llm.lastRequest.getMessages()
                .get(llm.lastRequest.getMessages().size() - 1).getContent();
        assertThat(prompt).contains("OLD-SUMMARY-CONTENT");
    }

    // ---- compact(): LLM failure fallback ----

    @Test
    void llmFailureFallsBackToAggressiveEvictionAndHardTruncation() {
        AgentSession session = sessionWith(longConversation());
        llm.response = Mono.error(new RuntimeException("provider down"));

        List<ConversationMessage> result = compactor.compact(session).block();

        assertThat(result).isNotNull();
        assertThat(llm.inferCalls).isEqualTo(1);
        // Middle segment replaced by the failure placeholder…
        ConversationMessage placeholder = result.get(1);
        assertThat(placeholder.getRole()).isEqualTo("system");
        assertThat(placeholder.getContent())
                .startsWith(ContextCompactor.SUMMARY_MARKER)
                .contains("摘要生成失败");
        // …and the recent window survives.
        assertThat(result.get(result.size() - 1).getContent()).startsWith("step 9");
        assertThat(result).hasSize(2 + config.getKeepRecentMessages());
    }

    // ---- Orphaned tool-message cleanup ----

    @Test
    void cleanupDropsToolResultsWithoutMatchingCall() {
        List<ConversationMessage> messages = Arrays.asList(
                ConversationMessage.user("hi"),
                ConversationMessage.toolResult("orphan", "web_search", "stale"),
                assistantWithCall("c1", "web_fetch"),
                ConversationMessage.toolResult("c1", "web_fetch", "ok"));

        List<ConversationMessage> result = compactor.cleanupOrphanedToolMessages(messages);

        assertThat(result).hasSize(3);
        assertThat(result.get(0).getRole()).isEqualTo("user");
        assertThat(result.get(1).getToolCalls()).isNotEmpty();
        assertThat(result.get(2).getToolCallId()).isEqualTo("c1");
    }

    @Test
    void cleanupRebuildsAssistantWithUnansweredToolCalls() {
        List<ConversationMessage> messages = Arrays.asList(
                ConversationMessage.user("hi"),
                ConversationMessage.builder()
                        .role("assistant")
                        .content("let me check two things")
                        .toolCalls(Arrays.asList(
                                new ConversationMessage.ToolCallInfo("c1", "function", "web_search", "{}"),
                                new ConversationMessage.ToolCallInfo("c2", "function", "web_fetch", "{}")))
                        .build(),
                ConversationMessage.toolResult("c1", "web_search", "partial")); // c2 unanswered

        List<ConversationMessage> result = compactor.cleanupOrphanedToolMessages(messages);

        assertThat(result).hasSize(2);
        ConversationMessage rebuilt = result.get(1);
        assertThat(rebuilt.getRole()).isEqualTo("assistant");
        assertThat(rebuilt.getContent()).isEqualTo("let me check two things");
        assertThat(rebuilt.getToolCalls()).isNull(); // group neutralized
    }

    @Test
    void cleanupDropsContentlessAssistantWithUnansweredToolCalls() {
        List<ConversationMessage> messages = Arrays.asList(
                ConversationMessage.user("hi"),
                assistantWithCall("c1", "web_search")); // no result at all, content present
        // assistantWithCall carries content, so it is kept without toolCalls
        List<ConversationMessage> kept = compactor.cleanupOrphanedToolMessages(messages);
        assertThat(kept).hasSize(2);
        assertThat(kept.get(1).getToolCalls()).isNull();

        List<ConversationMessage> messages2 = Arrays.asList(
                ConversationMessage.user("hi"),
                ConversationMessage.builder()
                        .role("assistant")
                        .toolCalls(Collections.singletonList(
                                new ConversationMessage.ToolCallInfo("c1", "function", "web_search", "{}")))
                        .build());
        List<ConversationMessage> dropped = compactor.cleanupOrphanedToolMessages(messages2);
        assertThat(dropped).hasSize(1);
        assertThat(dropped.get(0).getRole()).isEqualTo("user");
    }

    @Test
    void cleanupKeepsCompleteToolCallGroups() {
        List<ConversationMessage> messages = threeRounds(600);
        assertThat(compactor.cleanupOrphanedToolMessages(messages))
                .containsExactlyElementsOf(messages);
    }

    // ---- Tool-result write governance ----

    @Test
    void truncateToolResultCapsLongContentAndNotesOriginalLength() {
        String content = repeat('z', 250);
        String truncated = ContextCompactor.truncateToolResult(content, 100);
        assertThat(truncated)
                .startsWith(repeat('z', 100))
                .contains("[已截断，原始长度 250 字符]");

        assertThat(ContextCompactor.truncateToolResult("short", 100)).isEqualTo("short");
        assertThat(ContextCompactor.truncateToolResult(null, 100)).isNull();
        assertThat(ContextCompactor.truncateToolResult(content, 0)).isEqualTo(content);
    }
}
