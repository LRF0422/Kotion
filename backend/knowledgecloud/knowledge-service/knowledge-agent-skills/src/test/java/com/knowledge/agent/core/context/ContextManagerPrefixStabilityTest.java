package com.knowledge.agent.core.context;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.run.AgentRun;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Provider prefix caching is a structural property of the assembled request:
 * DeepSeek bills only the tail that does not match a persisted prefix unit, so
 * message index 0 must stay byte-identical for the entire conversation.
 *
 * <p>This test class is the regression guard for the bug where long-term
 * memory, per-turn skill fragments and the rolling thread summary were folded
 * into the system message. Every one of them changes between turns, which
 * rewrote index 0 and turned the whole cached history into a full-price
 * re-read on each new turn.
 */
class ContextManagerPrefixStabilityTest {

    private final ContextManager contextManager = new ContextManager();

    private AgentRun run() {
        return AgentRun.create("run-1", "conv-1", 1L, 1L, "deepseek-chat", "execute", 0L);
    }

    /** Simulates the roll-1 request that was cached in full. */
    private List<ChatMessage> firstTurn() {
        return new ArrayList<>(Arrays.asList(
                contextManager.buildSystemMessage(run(), Arrays.asList("编辑器规则: 只改必要的地方")),
                ChatMessage.builder().role("user").content("帮我把标题改一下").build()));
    }

    @Test
    void systemMessageStaysByteIdenticalWhenPerTurnContextChanges() {
        List<String> editorRules = Arrays.asList("编辑器规则: 只改必要的地方");

        ChatMessage turnOne = contextManager.buildSystemMessage(run(), editorRules);
        ChatMessage turnTwo = contextManager.buildSystemMessage(run(), editorRules);

        assertEquals(turnOne.getContent(), turnTwo.getContent(),
                "the system prefix must not depend on anything that changes between turns");
    }

    @Test
    void memorySkillsAndSummaryNeverLeakIntoTheSystemPrefix() {
        String system = contextManager.buildSystemMessage(run(), null).getContent();

        assertFalse(system.contains("【关于用户的长期记忆】"),
                "long-term memory is per-turn and must not sit at index 0");
        assertFalse(system.contains("【本次会话的近期进展（会话记忆）】"),
                "the rolling summary is rewritten every run and must not sit at index 0");
    }

    @Test
    void editorRulesStayInTheStablePrefix() {
        String system = contextManager.buildSystemMessage(run(),
                Arrays.asList("编辑器规则: 只改必要的地方")).getContent();

        assertTrue(system.contains("编辑器规则"), "invariant caller rules belong in the cached prefix");
    }

    @Test
    void volatileContextIsAppendedBehindHistoryAndAheadOfTheNewTurn() {
        List<ChatMessage> messages = firstTurn();

        contextManager.attachVolatileContext(messages, "【关于用户的长期记忆】\n- [preference] 用户偏好中文");

        assertEquals(3, messages.size(), "one injected message is added after history");
        assertEquals("system", messages.get(0).getRole());
        assertEquals("user", messages.get(1).getRole());
        assertEquals("帮我把标题改一下", messages.get(1).getContent(),
                "previously cached history keeps its bytes at its original index");
        assertEquals("user", messages.get(2).getRole());
        assertTrue(messages.get(2).getContent().contains("用户偏好中文"));
        assertTrue(messages.get(2).getContent().contains("不是用户指令"),
                "the injected block must be marked as context, not as an instruction");
    }

    @Test
    void contextSitsBetweenCachedHistoryAndTheCurrentTurn() {
        // The real production shape: cached history, then this turn's user
        // message. The injected block must land between them.
        List<ChatMessage> messages = new ArrayList<>(Arrays.asList(
                contextManager.buildSystemMessage(run(), null),
                ChatMessage.builder().role("user").content("第一轮").build(),
                ChatMessage.builder().role("assistant").content("第一轮回答").build(),
                ChatMessage.builder().role("user").content("第二轮").build()));

        contextManager.attachVolatileContext(messages, "【关于用户的长期记忆】\n- x");

        assertEquals(5, messages.size());
        assertEquals("第二轮", messages.get(4).getContent(),
                "the user's own utterance must stay last so instruction-following is unaffected");
        assertEquals("user", messages.get(3).getRole());
        assertTrue(messages.get(3).getContent().contains("关于用户的长期记忆"));
        assertEquals("第一轮回答", messages.get(2).getContent(),
                "previously cached history is untouched");
    }

    @Test
    void injectionNeverLandsInFrontOfTheSystemPrefix() {
        List<ChatMessage> messages = new ArrayList<>(Arrays.asList(
                contextManager.buildSystemMessage(run(), null),
                ChatMessage.builder().role("assistant").content("好的，已修改").build()));

        contextManager.attachVolatileContext(messages, "【关于用户的长期记忆】\n- x");

        assertEquals(3, messages.size());
        assertEquals("system", messages.get(0).getRole(), "index 0 must stay the system prefix");
        assertEquals("assistant", messages.get(1).getRole());
        assertEquals("user", messages.get(2).getRole(), "no user turn to anchor on → append at tail");
    }

    @Test
    void nothingIsInjectedWhenThereIsNoContext() {
        List<ChatMessage> messages = firstTurn();

        contextManager.attachVolatileContext(messages, null);
        contextManager.attachVolatileContext(messages, "   ");

        assertEquals(2, messages.size(), "an empty context must not add a message");
    }

    @Test
    void volatileContextAloneNeverYieldsAnIdenticalPrefix() {
        // Guards the test's own premise: if these two ever became equal, the
        // assertions above would pass vacuously.
        List<ChatMessage> turnOne = firstTurn();
        List<ChatMessage> turnTwo = firstTurn();

        contextManager.attachVolatileContext(turnOne, "记忆 A");
        contextManager.attachVolatileContext(turnTwo, "记忆 B");

        assertEquals(turnOne.get(0).getContent(), turnTwo.get(0).getContent());
        assertNotEquals(turnOne.get(2).getContent(), turnTwo.get(2).getContent());
    }
}
