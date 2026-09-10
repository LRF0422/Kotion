package com.knowledge.agent.core.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.knowledge.agent.core.skill.RemoteSkillRegistry;
import com.knowledge.agent.core.skill.RemoteSkillTool;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ToolGatewayTest {

    private static final long MAX_SAFE_INTEGER = 9007199254740991L;

    private final ObjectMapper jsonMapper = new ObjectMapper();

    @Test
    void keepsLongSchemaBoundsNumericWithApplicationLongStringSerializer() throws Exception {
        Map<String, Object> positionSchema = new LinkedHashMap<>();
        positionSchema.put("type", "integer");
        positionSchema.put("minimum", -MAX_SAFE_INTEGER);
        positionSchema.put("maximum", MAX_SAFE_INTEGER);

        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("position", positionSchema);

        Map<String, Object> inputSchema = new LinkedHashMap<>();
        inputSchema.put("type", "object");
        inputSchema.put("properties", properties);

        ToolSpec spec = ToolSpec.of(
                "getLogicFlowDiagram",
                "Read a LogicFlow diagram",
                inputSchema,
                ToolKind.FRONTEND,
                true,
                "client");
        ToolGateway gateway = new ToolGateway(
                Collections.emptyList(), applicationObjectMapper(), null);

        JsonNode position = jsonMapper.readTree(gateway.buildToolsJson(Collections.singletonList(spec)))
                .path(0)
                .path("function")
                .path("parameters")
                .path("properties")
                .path("position");
        JsonNode minimum = position.path("minimum");
        JsonNode maximum = position.path("maximum");

        assertTrue(minimum.isIntegralNumber(), "minimum must remain a JSON number");
        assertFalse(minimum.isTextual());
        assertEquals(-MAX_SAFE_INTEGER, minimum.longValue());
        assertTrue(maximum.isIntegralNumber(), "maximum must remain a JSON number");
        assertFalse(maximum.isTextual());
        assertEquals(MAX_SAFE_INTEGER, maximum.longValue());
    }

    @Test
    void executesBackendToolResolvedFromRemoteRegistry() {
        RemoteSkillRegistry registry = mock(RemoteSkillRegistry.class);
        RemoteSkillTool remoteTool = mock(RemoteSkillTool.class);
        ToolContext context = new ToolContext();
        Map<String, Object> result = Collections.singletonMap("value", "ok");
        when(registry.find("remote.echo")).thenReturn(remoteTool);
        when(remoteTool.execute(anyMap(), same(context))).thenReturn(result);

        ToolGateway gateway = new ToolGateway(Collections.emptyList(), new ObjectMapper(), registry);
        ToolOutcome outcome = gateway.executeBackend("call-1", "remote.echo", "{\"text\":\"hi\"}", context);

        assertTrue(outcome.isOk());
        assertEquals(result, outcome.getResult());
        verify(remoteTool).execute(anyMap(), same(context));
    }

    private ObjectMapper applicationObjectMapper() {
        SimpleModule longAsString = new SimpleModule();
        longAsString.addSerializer(Long.class, ToStringSerializer.instance);
        longAsString.addSerializer(Long.TYPE, ToStringSerializer.instance);
        return new ObjectMapper().registerModule(longAsString);
    }
}
