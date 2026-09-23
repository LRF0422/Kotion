package com.knowledge.agent.core.context;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.llm.LlmGateway;
import com.knowledge.agent.core.llm.LlmInferRequest;
import com.knowledge.agent.core.llm.LlmResult;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockingDetails;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Compaction must reproduce the same model-visible prefix on a fresh instance
 * (another cluster node, or after a restart) even though the in-process summary
 * cache is empty. The durable {@link CompactionSummaryStore} is what makes that
 * possible; without it every restart would re-summarize a span with a possibly
 * different result and invalidate the provider prefix cache.
 */
class ContextManagerCompactionStoreTest {

    private static final String MODEL = "deepseek-v4-flash";
    private static final String SCOPE = "conv-1";

    @Test
    void freshInstanceReusesDurableSummaryInsteadOfCallingTheModelAgain() {
        AgentCoreProperties props = new AgentCoreProperties();
        props.getContext().setMaxContextTokens(400);
        props.getContext().setCompactionThreshold(0.5); // compact above 200 estimated tokens

        MapSummaryStore store = new MapSummaryStore();
        List<ChatMessage> input = bulkyConversation();

        LlmGateway firstGateway = mock(LlmGateway.class);
        when(firstGateway.infer(any(LlmInferRequest.class))).thenReturn(summaryResult());
        ContextManager first = new ContextManager(props);
        first.setLlmGateway(firstGateway);
        first.setCompactionSummaryStore(store);
        List<ChatMessage> firstResult = first.assemble(input, MODEL, SCOPE);
        int firstCalls = mockingDetails(firstGateway).getInvocations().size();
        assertTrue(firstCalls > 0, "the first instance must summarize at least one span");
        assertTrue(store.map.size() > 0, "the summary must be persisted");

        // A fresh instance (empty in-memory cache) must find every span in the
        // store and never touch the model.
        LlmGateway secondGateway = mock(LlmGateway.class);
        when(secondGateway.infer(any(LlmInferRequest.class))).thenReturn(summaryResult());
        ContextManager second = new ContextManager(props);
        second.setLlmGateway(secondGateway);
        second.setCompactionSummaryStore(store);
        List<ChatMessage> secondResult = second.assemble(input, MODEL, SCOPE);

        verify(secondGateway, never()).infer(any(LlmInferRequest.class));
        assertEquals(signature(firstResult), signature(secondResult),
                "a restart must reproduce the same compacted prefix");
    }

    private LlmResult summaryResult() {
        LlmResult result = new LlmResult();
        result.setText("摘要");
        return result;
    }

    private List<ChatMessage> bulkyConversation() {
        List<ChatMessage> input = new ArrayList<>();
        input.add(ChatMessage.builder().role("system").content("sys").build());
        for (int i = 0; i < 12; i++) {
            StringBuilder content = new StringBuilder("step " + i + " ");
            while (content.length() < 200) {
                content.append('x');
            }
            input.add(ChatMessage.builder().role("user").content(content.toString()).build());
        }
        return input;
    }

    private String signature(List<ChatMessage> messages) {
        StringBuilder builder = new StringBuilder();
        for (ChatMessage message : messages) {
            builder.append(message.getRole()).append('|')
                    .append(message.getName()).append('|')
                    .append(message.getContent()).append('\n');
        }
        return builder.toString();
    }

    /** Minimal in-memory stand-in for the Redis store. */
    private static final class MapSummaryStore implements CompactionSummaryStore {
        private final Map<String, String> map = new HashMap<>();

        @Override
        public String find(String scope, String key) {
            return map.get(scope + "|" + key);
        }

        @Override
        public void save(String scope, String key, String summary) {
            map.put(scope + "|" + key, summary);
        }
    }
}
