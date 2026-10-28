package com.knowledge.agent.core.context;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.llm.LlmGateway;
import com.knowledge.agent.core.llm.LlmInferRequest;
import com.knowledge.agent.core.llm.LlmResult;
import com.knowledge.agent.core.tool.ToolResultLimiter;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Compaction must stay safe in the two places it used to give up or do damage:
 * a window that cannot be folded down to the budget, and an indivisible
 * discovery payload caught inside a fold.
 */
class ContextManagerCompactionFallbackTest {

    private static final String MODEL = "test-model";

    private AgentCoreProperties props(int maxContextTokens, double threshold, int keepRecent) {
        AgentCoreProperties props = new AgentCoreProperties();
        props.getContext().setMaxContextTokens(maxContextTokens);
        props.getContext().setCompactionThreshold(threshold);
        props.getContext().setKeepRecentMessages(keepRecent);
        return props;
    }

    private LlmGateway gateway() {
        LlmGateway gateway = mock(LlmGateway.class);
        LlmResult result = new LlmResult();
        result.setText("摘要");
        when(gateway.infer(any(LlmInferRequest.class))).thenReturn(result);
        return gateway;
    }

    private static ChatMessage system() {
        return ChatMessage.builder().role("system").content("sys").build();
    }

    private static ChatMessage user(String content) {
        return ChatMessage.builder().role("user").content(content).build();
    }

    private static String filler(int length) {
        StringBuilder builder = new StringBuilder("step ");
        while (builder.length() < length) {
            builder.append('x');
        }
        return builder.toString();
    }

    /**
     * The deferred-tool specs are the only copy of those schemas in the context.
     * Folding the span that carries them keeps "loaded the skill" and drops every
     * argument name, after which the model can neither call the tools nor learn
     * how — the highest-cost failure compaction can cause.
     */
    @Test
    void discoveryPayloadAndItsCallSurviveCompaction() {
        StringBuilder specs = new StringBuilder("{\"success\":true,\"activateTools\":[");
        for (int i = 0; i < 60; i++) {
            specs.append(i == 0 ? "" : ",")
                    .append("{\"name\":\"tool").append(i)
                    .append("\",\"inputSchema\":{\"type\":\"object\"}}");
        }
        specs.append("]}");
        String payload = specs.toString();

        List<ChatMessage> input = new ArrayList<>(Arrays.asList(
                system(),
                user(filler(400)),
                ChatMessage.builder().role("assistant").content("loading")
                        .toolCalls(Collections.singletonList(new ChatMessage.ToolCallInfo(
                                "call-1", "function",
                                new ChatMessage.ToolCallInfo.FunctionInfo("load_skill", "{}")))).build(),
                ChatMessage.builder().role("tool").toolCallId("call-1").name("load_skill")
                        .content(payload).build()));
        for (int i = 0; i < 10; i++) {
            input.add(user(filler(400)));
            input.add(ChatMessage.builder().role("assistant").content(filler(400)).build());
        }

        ContextManager contextManager = new ContextManager(props(400, 0.5, 1));
        contextManager.setLlmGateway(gateway());

        List<ChatMessage> assembled = contextManager.assemble(input, MODEL, "conv-1");

        ChatMessage payloadMessage = assembled.stream()
                .filter(message -> payload.equals(message.getContent()))
                .findFirst().orElse(null);
        assertNotNull(payloadMessage, "the discovery payload must reach the model byte-identically");

        int payloadIndex = assembled.indexOf(payloadMessage);
        assertEquals("assistant", assembled.get(payloadIndex - 1).getRole(),
                "the call that produced the payload must be kept, or the tool result is orphaned");
        assertNotNull(assembled.get(payloadIndex - 1).getToolCalls());
        assertTrue(assembled.size() < input.size(), "the rest of the history must still be folded");
    }

    /**
     * The tool catalog is rendered in front of the messages, so it competes for the
     * same window. Budgeting only the messages made the estimate ~10% optimistic
     * and pushed the overflow past the point where compaction would have run.
     */
    @Test
    void toolDefinitionsCountAgainstTheCompactionBudget() {
        List<ChatMessage> input = new ArrayList<>();
        input.add(system());
        for (int i = 0; i < 4; i++) {
            input.add(user(filler(100)));
        }

        StringBuilder tools = new StringBuilder("[");
        while (tools.length() < 1600) {
            tools.append('x');
        }
        tools.append(']');

        ContextManager contextManager = new ContextManager(props(1000, 0.5, 16));
        contextManager.setLlmGateway(gateway());

        List<ChatMessage> withoutTools = contextManager.assemble(input, MODEL, "conv-1");
        assertEquals(input.size(), withoutTools.size(),
                "the conversation alone fits the window, so nothing may be folded");

        List<ChatMessage> withTools = contextManager.assemble(input, MODEL, "conv-1", tools.toString());
        assertTrue(withTools.size() < input.size(),
                "the same conversation no longer fits once the catalog is counted");
    }

    /**
     * When the retained tail alone busts the budget, folding has nothing left to
     * take and the request used to ship over-budget anyway (a 400 from the
     * provider). The fallback caps the offending message instead.
     */
    @Test
    void oversizedSingleMessageIsCappedWhenNothingIsFoldable() {
        String huge = filler(6000);
        List<ChatMessage> input = new ArrayList<>(Arrays.asList(system(), user(huge)));

        ContextManager contextManager = new ContextManager(props(400, 0.5, 16));
        contextManager.setLlmGateway(gateway());

        List<ChatMessage> assembled = contextManager.assemble(input, MODEL, "conv-1");

        assertEquals(2, assembled.size(), "the system prefix and the capped turn are all that is left");
        String capped = assembled.get(1).getContent();
        assertTrue(capped.contains("middle pruned"), "the oversized turn must be capped");
        assertTrue(capped.length() < huge.length());
        assertTrue(contextManager.estimateTokens(assembled, 0)
                        <= contextManager.estimateTokens(input, 0),
                "the cap must bring the estimate down, never up");
    }

    /**
     * A summary must not re-narrate the summaries already in the log. The old
     * prompt replayed everything up to the span end, so each new summary covered
     * the same ground again while the older ones stayed in the context.
     */
    @Test
    void summarizerReceivesEarlierSummariesAsBackgroundOnly() {
        List<ChatMessage> input = new ArrayList<>();
        input.add(system());
        for (int i = 0; i < 20; i++) {
            input.add(user(filler(400)));
        }

        AgentCoreProperties props = props(400, 0.5, 1);
        props.getContext().setSummaryPromptMaxChars(2000);
        LlmGateway gateway = gateway();
        ContextManager contextManager = new ContextManager(props);
        contextManager.setLlmGateway(gateway);

        contextManager.assemble(input, MODEL, "conv-1");

        ArgumentCaptor<LlmInferRequest> captor = ArgumentCaptor.forClass(LlmInferRequest.class);
        verify(gateway, atLeast(2)).infer(captor.capture());

        LlmInferRequest withBackground = captor.getAllValues().stream()
                .filter(request -> request.getMessages().stream()
                        .anyMatch(message -> message.getContent() != null
                                && message.getContent().startsWith("【已有摘要（背景资料）】")))
                .findFirst().orElse(null);
        assertNotNull(withBackground,
                "a second span must be summarized with the first summary as background");

        ChatMessage subject = withBackground.getMessages()
                .get(withBackground.getMessages().size() - 1);
        assertTrue(subject.getContent().startsWith("【待压缩片段】"));
        assertFalse(subject.getContent().contains("[较早对话摘要（L2 压缩）]"),
                "the earlier summary must not be part of the text being summarized");
    }

    /**
     * A user turn is where the task is stated, and it is routinely a long paste
     * followed by the ask at the very END. The summarizer used to get a flat
     * head-only 2000-char cut, which threw the ask away and left the summary to
     * describe the paste instead of the task.
     */
    @Test
    void summarizerKeepsTheAskAtTheEndOfALongUserTurn() {
        String paste = "x".repeat(19_000) + " PLEASE REVERT THE SECOND TABLE";
        List<ChatMessage> input = new ArrayList<>(Arrays.asList(
                system(),
                user(paste),
                user("继续")));

        LlmGateway gateway = gateway();
        ContextManager contextManager = new ContextManager(props(2000, 0.5, 1));
        contextManager.setLlmGateway(gateway);

        contextManager.assemble(input, MODEL, "conv-1");

        ArgumentCaptor<LlmInferRequest> captor = ArgumentCaptor.forClass(LlmInferRequest.class);
        verify(gateway, atLeast(1)).infer(captor.capture());
        ChatMessage subject = captor.getValue().getMessages()
                .get(captor.getValue().getMessages().size() - 1);

        assertTrue(subject.getContent().contains("PLEASE REVERT THE SECOND TABLE"),
                "the end of a user turn carries the actual ask and must be kept");
        assertTrue(subject.getContent().length() < paste.length(),
                "the paste itself must still be clipped");
    }

    /**
     * An assistant turn that only calls tools has empty content, so it reached the
     * summarizer as a bare {@code assistant:} line and the summary could not name
     * a single action taken.
     */
    @Test
    void summarizerSeesTheToolCallsOfAnEmptyAssistantTurn() {
        List<ChatMessage> input = new ArrayList<>(Arrays.asList(
                system(),
                ChatMessage.builder().role("assistant").content("")
                        .toolCalls(Collections.singletonList(new ChatMessage.ToolCallInfo(
                                "c1", "function",
                                new ChatMessage.ToolCallInfo.FunctionInfo("readPage", "{}"))))
                        .build(),
                // Long enough to bust the window, so the span really gets folded.
                ChatMessage.builder().role("tool").toolCallId("c1").name("readPage")
                        .content("page body " + filler(8000)).build(),
                user("继续")));

        LlmGateway gateway = gateway();
        ContextManager contextManager = new ContextManager(props(2000, 0.5, 1));
        contextManager.setLlmGateway(gateway);

        contextManager.assemble(input, MODEL, "conv-1");

        ArgumentCaptor<LlmInferRequest> captor = ArgumentCaptor.forClass(LlmInferRequest.class);
        verify(gateway, atLeast(1)).infer(captor.capture());
        ChatMessage subject = captor.getValue().getMessages()
                .get(captor.getValue().getMessages().size() - 1);

        assertTrue(subject.getContent().contains("[call readPage]"),
                "the span must name the tools the assistant called");
    }

    /**
     * Folding cannot shrink the summary chain — only messages ahead of the retained
     * tail are foldable, and a summary never is. So a long run ended up throwing
     * the verbatim tail away while keeping every summary that had accumulated.
     */
    @Test
    void summaryChainIsMergedWhenFoldingCannotShrinkItAnyFurther() {
        String header = "[较早对话摘要（L2 压缩）]";
        List<ChatMessage> input = new ArrayList<>(Arrays.asList(
                system(),
                ChatMessage.builder().role("system")
                        .content(header + "\n" + filler(3000)).build(),
                ChatMessage.builder().role("system")
                        .content(header + "\n" + filler(3000)).build(),
                user("继续")));

        LlmGateway gateway = gateway();
        ContextManager contextManager = new ContextManager(props(2000, 0.5, 1));
        contextManager.setLlmGateway(gateway);

        List<ChatMessage> assembled = contextManager.assemble(input, MODEL, "conv-1");

        assertEquals(3, assembled.size(), "the chain must collapse to a single summary");
        assertEquals("system", assembled.get(0).getRole());
        assertTrue(assembled.get(1).getContent().startsWith(header));
        assertEquals("继续", assembled.get(2).getContent());

        ArgumentCaptor<LlmInferRequest> captor = ArgumentCaptor.forClass(LlmInferRequest.class);
        verify(gateway, atLeast(1)).infer(captor.capture());
        boolean rolledUp = captor.getAllValues().stream().anyMatch(request ->
                request.getMessages().get(0).getContent().contains("合并成一段"));
        assertTrue(rolledUp, "the chain must be merged by a dedicated summarization call");
    }

    /**
     * The write side capped a result in bytes and then appended its marker on top,
     * so an ASCII result landed one marker ABOVE {@code toolResultMaxChars} and L1
     * — which compares characters — cut it a second time, deleting the marker that
     * told the model its result was incomplete.
     */
    @Test
    void l1DoesNotRecutAResultTheWriterAlreadyCapped() {
        int cap = new AgentCoreProperties().getContext().getToolResultMaxChars();
        String written = ToolResultLimiter.truncateText("x".repeat(50_000), cap);
        assertTrue(written.length() <= cap, "the writer must stay inside the char cap");

        List<ChatMessage> input = new ArrayList<>(Arrays.asList(
                system(),
                ChatMessage.builder().role("assistant").content("reading")
                        .toolCalls(Collections.singletonList(new ChatMessage.ToolCallInfo(
                                "c1", "function",
                                new ChatMessage.ToolCallInfo.FunctionInfo("readPage", "{}"))))
                        .build(),
                ChatMessage.builder().role("tool").toolCallId("c1").name("readPage")
                        .content(written).build()));

        ContextManager contextManager = new ContextManager(props(200_000, 0.5, 16));
        contextManager.setLlmGateway(gateway());

        List<ChatMessage> assembled = contextManager.assemble(input, MODEL, "conv-1");

        String result = assembled.get(2).getContent();
        assertFalse(result.contains("middle pruned"),
                "a result the writer already capped must not be cut again");
        assertTrue(ToolResultLimiter.isTruncated(result),
                "the incomplete-result marker must survive L1");
    }
}
