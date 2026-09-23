package com.knowledge.agent.core.context;

import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The deferred-tool directory is what makes skill-owned (plugin) tools callable
 * without paying for their JSON Schema in every prompt. It must advertise the
 * name and a parameter signature — and nothing more.
 */
class ContextManagerDeferredToolsTest {

    private final ContextManager contextManager = new ContextManager();

    private AgentRun run() {
        return AgentRun.create("run-1", "conv-1", 1L, 1L, "deepseek-chat", "execute", 0L);
    }

    private ToolSpec insertChart() {
        Map<String, Object> type = new LinkedHashMap<>();
        type.put("type", "string");
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("type", "object");
        data.put("description", "a very long nested schema that must not reach the prompt");
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("chartType", type);
        properties.put("data", data);
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", new ArrayList<>(Arrays.asList("chartType")));
        return ToolSpec.of("insertChart", "插入图表", schema, ToolKind.FRONTEND, false, "client");
    }

    @Test
    void rendersSignatureWithOptionalMarkers() {
        String volatileContext = contextManager.buildVolatileContext(null, null,
                new ArrayList<>(Arrays.asList(insertChart())), null);

        assertTrue(volatileContext.contains("insertChart(chartType: string, data?: object): 插入图表"),
                "directory must carry the call signature; was: " + volatileContext);
    }

    @Test
    void trimsLongDescriptionsToTheConfiguredBudget() {
        StringBuilder longDescription = new StringBuilder();
        for (int i = 0; i < 600; i++) {
            longDescription.append('x');
        }
        ToolSpec verbose = ToolSpec.of("verbose", longDescription.toString(),
                new LinkedHashMap<>(), ToolKind.FRONTEND, true, "client");

        String content = contextManager.buildVolatileContext(null, null,
                new ArrayList<>(Arrays.asList(verbose)), null);

        assertTrue(content.contains("verbose()"));
        assertFalse(content.contains(longDescription.toString()),
                "a 600-char description must be trimmed out of the directory");
        assertTrue(content.contains("…"));
    }

    @Test
    void withholdsTheNestedSchemaBody() {
        String volatileContext = contextManager.buildVolatileContext(null, null,
                new ArrayList<>(Arrays.asList(insertChart())), null);

        assertFalse(volatileContext.contains("a very long nested schema"),
                "per-property schema details must stay out of the prompt until activation");
    }

    @Test
    void omitsTheSectionWhenNothingIsDeferred() {
        String withNone = contextManager.buildVolatileContext(null, null, new ArrayList<>(), null);
        String withNull = contextManager.buildVolatileContext(null, null, null, null);

        assertFalse(withNone != null && withNone.contains("【按需工具】"));
        assertFalse(withNull != null && withNull.contains("【按需工具】"));
    }

    @Test
    void toleratesSchemalessAndMalformedSpecs() {
        ToolSpec noSchema = ToolSpec.of("ping", "no args", null, ToolKind.FRONTEND, true, "client");
        Map<String, Object> odd = new LinkedHashMap<>();
        odd.put("properties", "not-an-object");
        ToolSpec malformed = ToolSpec.of("weird", null, odd, ToolKind.FRONTEND, true, "client");
        List<ToolSpec> deferred = new ArrayList<>(Arrays.asList(noSchema, malformed));

        String content = contextManager.buildVolatileContext(null, null, deferred, null);

        assertTrue(content.contains("ping(): no args"));
        assertTrue(content.contains("weird()"));
    }

    /**
     * The directory is per-turn context, not part of the immutable prefix: a
     * turn that activates a different skill set must not rewrite the message at
     * index 0, or the provider cache for the whole history is lost.
     */
    @Test
    void keepsTheDeferredDirectoryOutOfTheSystemPrefix() {
        ChatMessage system = contextManager.buildSystemMessage(run(), null);

        assertFalse(system.getContent().contains("【按需工具】"),
                "deferred tools belong to the volatile tail, never the system prefix");
        assertFalse(system.getContent().contains("insertChart"));
    }
}
