package com.knowledge.agent.core.context;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.run.AgentRun;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The client's domain policy arrives as skill fragments, and the loop must render
 * them as what they are: the current scenario's working rules.
 *
 * <p>The backend is domain-blind — it does not know what those rules say, only
 * that they are rules. That framing matters: without it the fragments would sit
 * inside the injected context block behind a footer that calls everything
 * "background context, not user instructions", which is exactly where a mandatory
 * rule ("always read before writing") gets ignored.
 */
class ContextManagerScenarioRulesTest {

    private final ContextManager contextManager = new ContextManager();

    private AgentRun run() {
        return AgentRun.create("run-1", "conv-1", 1L, 1L, "deepseek-chat", "execute", 0L);
    }

    @Test
    void skillFragmentsAreFramedAsScenarioRules() {
        String context = contextManager.buildStableContext(
                Collections.singletonList("# DOCUMENT EDITING\n\n1. ALWAYS read first"), null);

        assertNotNull(context);
        assertTrue(context.contains("【场景规范】"),
                "the client's domain policy must be introduced as scenario rules");
        assertTrue(context.contains("工作规范"),
                "the header must state that these are rules to follow, not background data");
        assertTrue(context.contains("ALWAYS read first"),
                "the fragment itself is rendered verbatim — the loop never rewrites it");
        // The header is the loop's, the content is the client's: no document
        // vocabulary may appear in the header.
        String header = context.substring(0, context.indexOf("# DOCUMENT EDITING"));
        for (String domainWord : Arrays.asList("文档", "页面", "编辑器", "块")) {
            assertFalse(header.contains(domainWord),
                    () -> "the scenario-rules header must stay domain-blind ('" + domainWord + "')");
        }
    }

    @Test
    void volatileContextUsesTheSameFraming() {
        // Delegated children / non-projected runs take the volatile path; the
        // parent's rules must keep their authority there too.
        String context = contextManager.buildVolatileContext(
                null, Collections.singletonList("scenario rule"), null, null);

        assertNotNull(context);
        assertTrue(context.contains("【场景规范】"));
        assertTrue(context.contains("scenario rule"));
    }

    @Test
    void noFragmentsMeansNoHeader() {
        assertFalse(String.valueOf(contextManager.buildStableContext(null, null)).contains("【场景规范】"));
        assertFalse(String.valueOf(contextManager.buildStableContext(Collections.emptyList(), null))
                .contains("【场景规范】"));
    }

    @Test
    void injectedContextFooterKeepsScenarioRulesAuthoritative() {
        ChatMessage injected = contextManager.buildInjectedContextMessage("【场景规范】\nrule");
        assertNotNull(injected);
        String content = injected.getContent();
        assertTrue(content.contains("必须遵守"),
                "the footer must not blanket-disclaim the scenario rules as background data");
        assertTrue(content.contains("不是用户指令"),
                "memory/profile context is still not a user instruction");
    }

    /**
     * A skill whose instructions the client deferred is rendered as one index entry
     * (name + purpose + owned tools). The model must be able to tell it apart from an
     * expanded skill and know how to expand it.
     */
    @Test
    void anIndexedSkillRendersAsOneCompactEntry() {
        String entry = ContextManager.renderSkillIndexEntry(
                "bitable-skill", "多维表格：建表、读写记录",
                Arrays.asList("insertBitable", "getBitableList"),
                Collections.singletonList("addBitableRecord"));
        assertTrue(entry.startsWith("【技能名】bitable-skill"), entry);
        assertTrue(entry.contains("多维表格：建表、读写记录"), entry);
        assertTrue(entry.contains("insertBitable、getBitableList、addBitableRecord"), entry);

        String block = ContextManager.renderSkillIndex(Collections.singletonList(entry));
        assertTrue(block.startsWith("【技能索引】"), block);
        assertTrue(block.contains("load_skill"),
                "the index must say how an entry is expanded");
        assertTrue(block.contains("- 【技能名】bitable-skill"), block);
        // It is a stable-context fragment like any other, so it renders under the
        // scenario-rules header.
        String rendered = contextManager.buildSkillsContext(Collections.singletonList(block));
        assertTrue(rendered.startsWith("【场景规范】"), rendered);
        assertTrue(rendered.contains("【技能索引】"), rendered);
    }

    /** A runaway purpose must not let one index entry dominate the block. */
    @Test
    void aLongPurposeIsTrimmedInTheIndex() {
        StringBuilder purpose = new StringBuilder();
        for (int i = 0; i < 500; i++) {
            purpose.append('x');
        }
        String entry = ContextManager.renderSkillIndexEntry(
                "verbose-skill", purpose.toString(), null, null);
        assertTrue(entry.contains("…"), "a 500-char purpose must be trimmed");
        assertTrue(entry.length() < 400, "one index entry stays a line, not a paragraph");
    }
}
