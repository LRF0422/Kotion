package com.knowledge.agent.core.context;

import com.knowledge.agent.api.dto.ChatMessage;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Providers reject `role: null` with 400 BAD_REQUEST. Even if a legacy
 * checkpoint or a client payload carries a blank role, context assembly must
 * repair it before the messages ever reach the LLM request.
 */
class ContextManagerSanitizationTest {

    private final ContextManager contextManager = new ContextManager();

    @Test
    void repairsBlankRolesAndDropsNullEntries() {
        ChatMessage system = ChatMessage.builder().role("system").content("sys").build();
        ChatMessage blank = ChatMessage.builder().content("client payload without role").build();
        List<ChatMessage> input = new ArrayList<>(Arrays.asList(system, null, blank));

        List<ChatMessage> assembled = contextManager.assemble(input);

        assertEquals(2, assembled.size());
        assertEquals("system", assembled.get(0).getRole());
        assertEquals("user", assembled.get(1).getRole());
        assertEquals("client payload without role", assembled.get(1).getContent());
    }

    @Test
    void oversizedToolResultIsPrunedDeterministicallyAsTheTailGrows() {
        StringBuilder huge = new StringBuilder();
        for (int i = 0; i < 20000; i++) {
            huge.append('A');
        }
        List<ChatMessage> input = new ArrayList<>(Arrays.asList(
                ChatMessage.builder().role("system").content("sys").build(),
                ChatMessage.builder().role("user").content("read it").build(),
                ChatMessage.builder().role("assistant").content("ok")
                        .toolCalls(Collections.singletonList(new ChatMessage.ToolCallInfo(
                                "call-1", "function",
                                new ChatMessage.ToolCallInfo.FunctionInfo("read", "{}")))).build(),
                ChatMessage.builder().role("tool").toolCallId("call-1").name("read")
                        .content(huge.toString()).build()));

        List<ChatMessage> first = contextManager.assemble(input);
        String firstRendered = first.get(3).getContent();
        assertTrue(firstRendered.contains("middle pruned"));
        assertTrue(firstRendered.length() < huge.length());

        // Append more turns the way the loop does; the pruned rendering of an
        // EXISTING message must not change (the old age-based eviction rewrote
        // a different early message on every step and broke the prefix cache).
        List<ChatMessage> grown = new ArrayList<>(input);
        for (int i = 0; i < 12; i++) {
            grown.add(ChatMessage.builder().role("user").content("step " + i).build());
            grown.add(ChatMessage.builder().role("assistant").content("done " + i).build());
        }
        List<ChatMessage> second = contextManager.assemble(grown);
        assertEquals(firstRendered, second.get(3).getContent(),
                "a pruned tool result must render byte-identically on every later step");
    }

    @Test
    void keepsWellFormedConversationIntact() {
        List<ChatMessage> input = new ArrayList<>(Arrays.asList(
                ChatMessage.builder().role("system").content("sys").build(),
                ChatMessage.builder().role("user").content("hi").build(),
                ChatMessage.builder().role("assistant").content("hello").build()));

        List<ChatMessage> assembled = contextManager.assemble(input);

        assertEquals(3, assembled.size());
        for (ChatMessage message : assembled) {
            assertNotNull(message.getRole());
        }
    }
}
