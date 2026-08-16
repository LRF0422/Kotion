package com.knowledge.agent.tool;

import com.knowledge.agent.api.dto.ChatFunction;
import com.knowledge.agent.api.dto.ChatTool;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Tests for {@link ToolRegistry#buildToolsJsonCached} — the capabilitiesVersion
 * keyed schema cache.
 */
class ToolRegistryCacheTest {

    private ToolRegistry registryWithOneTool() {
        ToolRegistry registry = new ToolRegistry();
        Tool tool = mock(Tool.class);
        when(tool.getId()).thenReturn("web_search");
        when(tool.getDescription()).thenReturn("Search the web");
        when(tool.getJsonSchema()).thenReturn("{\"type\":\"object\",\"properties\":{}}");
        registry.register(tool);
        return registry;
    }

    @Test
    void sameVersionKeyRendersOnce() {
        ToolRegistry registry = registryWithOneTool();

        String first = registry.buildToolsJsonCached("v1", null, null);
        String second = registry.buildToolsJsonCached("v1", null, null);

        assertThat(first).isNotBlank().contains("web_search");
        assertThat(second).isEqualTo(first);
    }

    @Test
    void differentVersionOrToolSetProduceTheirOwnEntries() {
        ToolRegistry registry = registryWithOneTool();

        String all = registry.buildToolsJsonCached("v1", null, null);
        String restricted = registry.buildToolsJsonCached(
                "v1", java.util.Collections.singleton("web_search"), null);
        String otherVersion = registry.buildToolsJsonCached("v2", null, null);

        assertThat(all).isEqualTo(restricted).isEqualTo(otherVersion);
    }

    @Test
    void blankVersionBypassesCache() {
        ToolRegistry registry = registryWithOneTool();

        String a = registry.buildToolsJsonCached(null, null, null);
        String b = registry.buildToolsJsonCached("", null, null);

        assertThat(a).isNotBlank();
        assertThat(b).isEqualTo(a);
    }

    @Test
    void frontendToolListParticipatesInCacheKey() {
        ToolRegistry registry = registryWithOneTool();

        String withoutFrontend = registry.buildToolsJsonCached("v1", null, null);
        ChatTool frontend = ChatTool.builder()
                .type("function")
                .function(ChatFunction.builder()
                        .name("fe_tool")
                        .description("Frontend tool")
                        .build())
                .readOnly(true)
                .build();
        String withFrontend = registry.buildToolsJsonCached(
                "v1", null, java.util.Collections.singletonList(frontend));

        assertThat(withFrontend).isNotEqualTo(withoutFrontend);
        assertThat(withFrontend).contains("fe_tool");
    }

    @Test
    void emptyRegistryRendersEmptyArray() {
        ToolRegistry registry = new ToolRegistry();
        assertThat(registry.buildToolsJsonCached("v1", null, null)).isEqualTo("[]");
    }
}
