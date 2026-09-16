package com.knowledge.agent.core.context;

import com.knowledge.agent.core.run.AgentRun;
import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A delegated child inherits the parent's editor persona and tool catalog, so
 * its system prompt must additionally scope it to the delegated task. Without
 * that scope the child reads the inherited persona as "go edit the document"
 * and modifies the page the parent has open even when the task is read-only
 * research — the "sub-agent ignores the main agent" bug.
 */
class ContextManagerSubAgentTest {

    private final ContextManager contextManager = new ContextManager();

    private AgentRun childRun() {
        AgentRun run = AgentRun.create("child-1", "conv-1", 1L, 1L, "deepseek-chat", "execute", 0L);
        run.setParentRunId("parent-1");
        return run;
    }

    @Test
    void delegatedSystemMessageScopesTheChildToItsTask() {
        String system = contextManager
                .buildSystemMessage(childRun(), Arrays.asList("编辑器规则: 只改必要的地方"), true)
                .getContent();

        assertTrue(system.contains("子 agent 规则"),
                "a delegated child must be told it is a sub-agent");
        assertTrue(system.contains("委派任务"),
                "the delegated task must be declared the authoritative goal");
        assertTrue(system.contains("除非委派任务明确要求"),
                "out-of-scope document edits must be forbidden by default");
        assertTrue(system.contains("编辑器规则"),
                "inherited editor rules stay available for scoped editing work");
    }

    @Test
    void rootSystemMessageDoesNotAdvertiseSubAgentRules() {
        String system = contextManager
                .buildSystemMessage(childRun(), null, false)
                .getContent();

        assertFalse(system.contains("子 agent 规则"),
                "the root agent must not be told it is a delegated child");
    }
}
