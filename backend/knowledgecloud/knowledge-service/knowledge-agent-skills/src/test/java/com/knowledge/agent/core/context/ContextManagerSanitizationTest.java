package com.knowledge.agent.core.context;

import com.knowledge.agent.api.dto.ChatMessage;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

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
