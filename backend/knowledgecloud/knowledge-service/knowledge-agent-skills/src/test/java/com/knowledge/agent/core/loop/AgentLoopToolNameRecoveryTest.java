package com.knowledge.agent.core.loop;

import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
