package com.knowledge.agent.core.context;

import com.knowledge.agent.core.run.AgentRun;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Tool naming and skill/tool association in the prompt.
 *
 * <p>Regression this guards: the base prompt used to advertise an
 * {@code editor.*} tool family. Tool namespacing was removed (every tool reaches
 * the model under its bare local name), so that line taught the model a prefix
 * that resolves to nothing — the documented cause of the invented
 * {@code editor_insertBlocks} call, the backend's {@code TOOL_NOT_FOUND} answer,
 * and the retry loop with a different invented prefix.
 *
 * <p>The second half pins the join between a skill's prose fragment and the exact
 * function names it owns: the deferred-tool directory gives signatures without
 * descriptions, so the model must be told which names the prose refers to.
 */
class ContextManagerToolNamingTest {

    private final ContextManager contextManager = new ContextManager();

    private AgentRun run() {
        return AgentRun.create("run-1", "conv-1", 1L, 1L, "deepseek-chat", "execute", 0L);
    }

    private String systemPrompt() {
        return contextManager.buildSystemMessage(run()).getContent();
    }

    @Test
    void basePromptAdvertisesNoToolNamespace() {
        String system = systemPrompt();
        Matcher phantom = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*\\.\\*").matcher(system);
        assertFalse(phantom.find(),
                () -> "the base prompt advertises the retired tool namespace '"
                        + phantom.group() + "' — tools have bare names, so this only teaches "
                        + "the model to invent a prefix");
        assertFalse(system.contains("editor_"),
                "the base prompt must not show an `editor_` prefixed tool name");
    }

    @Test
    void agentPromptNamesNoClientTool() {
        String system = systemPrompt();
        // Every tool the client ships is the client's business. The prompt may
        // only name the backend's own tools (see AgentPrompts).
        for (String clientTool : Arrays.asList(
                "getDocumentStructure", "readChunk", "searchInDocument",
                "replaceBlockById", "insertAtBlockId", "applyEdits",
                "deleteBlocks", "updateTitle", "referenceBlocks", "insertChart")) {
            assertFalse(system.contains(clientTool),
                    () -> "client tool " + clientTool + " must not appear in the agent prompt");
        }
    }

    @Test
    void skillFragmentNamesItsOwnedTools() {
        String rendered = ContextManager.renderSkillFragment(
                "You can find-and-replace content.",
                Arrays.asList("replaceContent", "insertNear"),
                Collections.singletonList("write"));

        assertTrue(rendered.startsWith("You can find-and-replace content."));
        assertTrue(rendered.contains("replaceContent, insertNear, write"),
                () -> "owned tools must be spelled out under the fragment: " + rendered);
    }

    @Test
    void skillFragmentDeduplicatesAndTrims() {
        String rendered = ContextManager.renderSkillFragment(
                "prose",
                Arrays.asList(" replaceContent ", "replaceContent", null, "  "),
                Collections.singletonList("replaceContent"));

        assertEquals("prose\n（本技能可直接调用的工具：replaceContent）", rendered);
    }

    @Test
    void skillFragmentWithoutToolsIsUnchanged() {
        assertEquals("prose", ContextManager.renderSkillFragment("prose", null, null));
        assertEquals("prose", ContextManager.renderSkillFragment(" prose ", Collections.emptyList(), null));
    }

    @Test
    void blankSkillFragmentYieldsNothing() {
        // A fragment-less skill (the auto-generated `<plugin>-default`) has no
        // prose to attach names to; its tools stay in the deferred directory.
        assertNull(ContextManager.renderSkillFragment(null, List.of("searchPages"), null));
        assertNull(ContextManager.renderSkillFragment("   ", List.of("searchPages"), null));
    }
}
