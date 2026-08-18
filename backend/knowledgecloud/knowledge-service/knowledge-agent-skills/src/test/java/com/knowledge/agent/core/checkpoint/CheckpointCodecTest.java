package com.knowledge.agent.core.checkpoint;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.run.PendingToolCall;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/** Checkpoint round-trips: messages, client tools, pending calls, sub-pending. */
class CheckpointCodecTest {

    private final CheckpointCodec codec = new CheckpointCodec(
            new ObjectMapper().configure(
                    com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false));

    @Test
    void roundTripsFullState() {
        Checkpoint checkpoint = new Checkpoint();
        checkpoint.setRunId("run-1");
        checkpoint.setNextStep(3);
        checkpoint.setModel("deepseek-chat");
        checkpoint.setMode("plan");
        checkpoint.setMaxSteps(24);
        checkpoint.setTemperature(0.3);
        checkpoint.setMaxTokens(4096);
        checkpoint.setToken("jwt-token");
        checkpoint.setDelegateDepth(1);
        checkpoint.setScratchpad("step1 done");

        ChatMessage system = ChatMessage.builder().role("system").content("sys").build();
        ChatMessage assistant = new ChatMessage();
        assistant.setRole("assistant");
        assistant.setContent("ok");
        checkpoint.getMessages().add(system);
        checkpoint.getMessages().add(assistant);

        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        ToolSpec tool = ToolSpec.of("editor.read", "read doc", schema, ToolKind.FRONTEND, true, "client");
        checkpoint.getClientTools().add(tool);
        checkpoint.getDeferredTools().add(
                ToolSpec.of("insertChart", "draw chart", schema, ToolKind.FRONTEND, false, "client"));

        checkpoint.getPendingToolCalls().add(PendingToolCall.of("c1", "editor.insert", "{\"a\":1}", 1000L));
        checkpoint.getPendingToolCalls().add(PendingToolCall.ofSub("c2", "editor.read", "{}", 1000L, "sub-1", "dcall-1"));
        checkpoint.getPendingPlanCalls().add(PendingToolCall.of("c3", "present_plan", "{\"plan\":\"x\"}", 2000L));

        String json = codec.toJson(checkpoint);
        Checkpoint restored = codec.fromJson(json);

        assertNotNull(restored);
        assertEquals("run-1", restored.getRunId());
        assertEquals(3, restored.getNextStep());
        assertEquals("plan", restored.getMode());
        assertEquals(Integer.valueOf(24), restored.getMaxSteps());
        assertEquals("jwt-token", restored.getToken());
        assertEquals(1, restored.getDelegateDepth());
        assertEquals("step1 done", restored.getScratchpad());
        assertEquals(2, restored.getMessages().size());
        assertEquals("sys", restored.getMessages().get(0).getContent());
        assertEquals(1, restored.getClientTools().size());
        assertEquals("editor.read", restored.getClientTools().get(0).getName());
        // Deferred tools must survive recovery, or a rebuilt loop would reject
        // the skill tools it advertised with TOOL_NOT_FOUND.
        assertEquals(1, restored.getDeferredTools().size());
        assertEquals("insertChart", restored.getDeferredTools().get(0).getName());
        assertEquals(2, restored.getPendingToolCalls().size());
        assertEquals("sub-1", restored.getPendingToolCalls().get(1).getSubRunId());
        assertEquals("dcall-1", restored.getPendingToolCalls().get(1).getDelegateCallId());
        assertEquals(1, restored.getPendingPlanCalls().size());
    }

    @Test
    void toleratesUnknownFieldsForForwardCompatibility() throws Exception {
        Checkpoint checkpoint = new Checkpoint();
        checkpoint.setRunId("run-x");
        String base = codec.toJson(checkpoint);
        String withExtra = base.substring(0, base.length() - 1) + ",\"futureField\":123}";
        Checkpoint restored = codec.fromJson(withExtra);
        assertEquals("run-x", restored.getRunId());
    }
}
