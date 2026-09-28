package com.knowledge.agent.core.loop;

import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Recovery for invented tool names.
 *
 * <p>Regression: the model calls {@code editor_insertBlocks} (a made-up
 * namespace prefix plus a semantic suffix) instead of
 * {@code insertAtBlockId}; the loop answers TOOL_NOT_FOUND with no suggestion,
 * so the model guesses again with another prefix. The message must name the
 * closest real tools — and must not name unrelated ones, because a confident
 * wrong suggestion is worse than none.
 */
class AgentLoopToolNameRecoveryTest {

    private static List<ToolSpec> editorCatalog() {
        return Arrays.asList(
                spec("insertAtBlockId", "在指定 blockId 的块之前或之后插入内容"),
                spec("insertNear", "在匹配文本附近插入内容"),
                spec("applyEdits", "批量执行多个编辑操作"),
                spec("replaceBlockById", "通过 blockId 替换整个块"),
                spec("deleteBlocks", "按 blockId 删除整块"),
                spec("getDocumentStructure", "获取文档结构"),
                spec("insertColumns", "创建多列布局"),
                spec("updateTitle", "更新文档标题"));
    }

    private static ToolSpec spec(String name, String description) {
        ToolSpec spec = ToolSpec.of(name, description, null, ToolKind.BACKEND, false, "builtin");
        return spec;
    }

    /**
     * What a run advertises now: bare local names only. Plugin tools used to
     * arrive as `{pluginKey}__{localName}`; that is what made a registered tool
     * unreachable behind a prefix nobody ever wrote.
     */
    private static List<ToolSpec> mixedCatalog() {
        return Arrays.asList(
                spec("insertAtBlockId", "insert"),
                spec("insertNear", "insert near"),
                spec("applyEdits", "batch"),
                spec("getDocumentStructure", "outline"),
                spec("searchPages", "搜索页面"),
                spec("createPage", "创建页面"),
                spec("openPageSide", "侧边打开"),
                spec("editPage", "切换离屏编辑目标"));
    }

    @Test
    void literalNamesAlwaysWin() {
        assertEquals("searchPages", AgentLoop.resolveToolName("searchPages", mixedCatalog()));
        assertEquals("createPage", AgentLoop.resolveToolName("createPage", mixedCatalog()));
        assertEquals("insertAtBlockId", AgentLoop.resolveToolName("insertAtBlockId", mixedCatalog()));
    }

    @Test
    void mangledSeparatorsAndCaseResolve() {
        assertEquals("insertAtBlockId", AgentLoop.resolveToolName("insert_at_block_id", mixedCatalog()));
        assertEquals("insertAtBlockId", AgentLoop.resolveToolName("InsertAtBlockID", mixedCatalog()));
        assertEquals("editPage", AgentLoop.resolveToolName("edit_page", mixedCatalog()));
    }

    @Test
    void namespacedNameFromAnOlderCatalogueStillRoutes() {
        // In-flight conversations recorded names under the retired scheme.
        assertEquals("searchPages", AgentLoop.resolveToolName("kn_plugin-main__searchPages", mixedCatalog()));
        assertEquals("createPage", AgentLoop.resolveToolName("kn-plugin-main_createPage", mixedCatalog()));
    }

    @Test
    void inventedNamespaceStillLands() {
        // The names actually observed in the UI.
        assertEquals("insertAtBlockId", AgentLoop.resolveToolName("editor_insertBlocks", mixedCatalog()));
        assertEquals("insertAtBlockId", AgentLoop.resolveToolName("editor__insertBlocks", mixedCatalog()));
        assertEquals("insertAtBlockId", AgentLoop.resolveToolName("plugin_editor_insertBlocks", mixedCatalog()));
    }

    @Test
    void unrelatedAndAmbiguousNamesNeverResolve() {
        assertNull(AgentLoop.resolveToolName("web_search", mixedCatalog()));
        assertNull(AgentLoop.resolveToolName("", mixedCatalog()));
        assertNull(AgentLoop.resolveToolName(null, mixedCatalog()));
        assertNull(AgentLoop.resolveToolName("editor_totallyMadeUp", mixedCatalog()));
        // Two plugins claiming the same local name is the real collision now.
        List<ToolSpec> collision = Arrays.asList(
                spec("write_page", "a"),
                spec("writePage", "b"));
        assertNull(AgentLoop.resolveToolName("write_page_x", collision));
        assertEquals("writePage", AgentLoop.resolveToolName("writePage", collision));
    }

    @Test
    void routingRewritesOnlyCorrectableNames() {
        List<com.knowledge.agent.core.llm.ToolCallRequest> calls = Arrays.asList(
                com.knowledge.agent.core.llm.ToolCallRequest.of("1", "searchPages", "{}"),
                com.knowledge.agent.core.llm.ToolCallRequest.of("2", "editor_insertBlocks", "{}"),
                com.knowledge.agent.core.llm.ToolCallRequest.of("3", "web_search", "{}"),
                com.knowledge.agent.core.llm.ToolCallRequest.of("4", "insert_at_block_id", "{}"));
        // routeToolCallNames is instance-private; the resolver is what is asserted
        // here, call by call, mirroring the loop's rewrite rule.
        assertEquals("searchPages", AgentLoop.resolveToolName(calls.get(0).getName(), mixedCatalog()));
        assertEquals("insertAtBlockId", AgentLoop.resolveToolName(calls.get(1).getName(), mixedCatalog()));
        assertNull(AgentLoop.resolveToolName(calls.get(2).getName(), mixedCatalog()));
        assertEquals("insertAtBlockId", AgentLoop.resolveToolName(calls.get(3).getName(), mixedCatalog()));
    }

    @Test
    void inventedNamespacePrefixRecoversTheRealTool() {
        List<String> nearest = AgentLoop.nearestToolNames("editor_insertBlocks", editorCatalog(), 3);

        assertEquals("insertAtBlockId", nearest.get(0),
                "the made-up prefix must not hide the real insert tool");
        assertTrue(nearest.size() <= 3);
    }

    @Test
    void snakeCaseAndCasingVariantsResolve() {
        // Separator/casing variants of a REAL name normalise to it, so there is
        // nothing to suggest: the call was routable, it just arrived elsewhere.
        for (String variant : Arrays.asList("insert_at_block_id", "InsertAtBlockID")) {
            assertTrue(AgentLoop.nearestToolNames(variant, editorCatalog(), 3).isEmpty(),
                    variant + " should be recognised as already-registered");
        }
        // A different word order is a genuine invention and must still recover.
        List<String> reordered = AgentLoop.nearestToolNames("insertBlocksAtPosition", editorCatalog(), 3);
        assertTrue(reordered.contains("insertAtBlockId"), String.valueOf(reordered));
    }

    @Test
    void unrelatedNamesYieldNoSuggestion() {
        assertTrue(AgentLoop.nearestToolNames("web_search", editorCatalog(), 3).isEmpty());
        assertTrue(AgentLoop.nearestToolNames("zzzzzzzzzzzz", editorCatalog(), 3).isEmpty());
        assertTrue(AgentLoop.nearestToolNames("", editorCatalog(), 3).isEmpty());
        assertTrue(AgentLoop.nearestToolNames("insertAtBlockId", null, 3).isEmpty());
        // A tool that already resolves is not a suggestion for itself.
        assertFalse(AgentLoop.nearestToolNames("insertAtBlockId", editorCatalog(), 3).contains("insertAtBlockId"));
    }

    @Test
    void messageNamesTheAlternatives() {
        String message = AgentLoop.unknownToolMessage("editor_insertBlocks", editorCatalog());

        assertTrue(message.startsWith("TOOL_NOT_FOUND"), message);
        assertTrue(message.contains("insertAtBlockId"), message);
        assertTrue(message.contains("不要臆造工具名"), message);

        String bare = AgentLoop.unknownToolMessage("web_search", editorCatalog());
        assertTrue(bare.startsWith("TOOL_NOT_FOUND"), bare);
        assertFalse(bare.contains("最接近的可用工具"), bare);
    }

    @Test
    void degenerateInputsDoNotThrow() {
        assertEquals(Collections.emptyList(), AgentLoop.nearestToolNames("x", editorCatalog(), 0));
        assertEquals(Collections.emptyList(), AgentLoop.nearestToolNames(null, editorCatalog(), 3));
        assertTrue(AgentLoop.unknownToolMessage("editor_insertBlocks", null).startsWith("TOOL_NOT_FOUND"));
    }
}
