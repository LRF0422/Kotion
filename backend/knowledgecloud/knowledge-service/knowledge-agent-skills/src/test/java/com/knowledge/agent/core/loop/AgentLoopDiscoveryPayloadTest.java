package com.knowledge.agent.core.loop;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.api.dto.ChatMessage;
import com.knowledge.agent.core.checkpoint.Checkpoint;
import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.event.RunEvent;
import com.knowledge.agent.core.event.RunEventLog;
import com.knowledge.agent.core.event.RunEvents;
import com.knowledge.agent.core.run.AgentRun;
import com.knowledge.agent.core.run.PendingToolCall;
import com.knowledge.agent.core.run.RunStatus;
import com.knowledge.agent.core.tool.ClientToolActivation;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * `load_skill` hands a skill's tool specs to the model inside its tool result.
 *
 * <p>That payload is indivisible: the model needs EVERY schema to call those
 * tools, so the ordinary per-result budget (a head/tail character cut) turns it
 * into invalid JSON with schemas silently missing — the skill looked loaded while
 * none of it could be used. It gets its own budget, and beyond even that the
 * answer degrades to valid JSON naming the tools instead of being cut.
 */
class AgentLoopDiscoveryPayloadTest {

    private final RunEventLog eventLog = mock(RunEventLog.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AgentCoreProperties properties = new AgentCoreProperties();

    @Test
    void aSkillBundleReachesTheModelWhole() throws Exception {
        // 40 schemas of ~600 chars: a realistic bundle, twice the per-result budget.
        Object result = bundle(40, 600);
        String content = contentOf(result);

        assertFalse(content.contains("[truncated]"), "a discovery payload must never be cut");
        JsonNode payload = objectMapper.readTree(content);
        assertEquals(40, payload.get(ClientToolActivation.FIELD).size(), "every schema is delivered");
        assertEquals("tool40", payload.get(ClientToolActivation.FIELD).get(39).get("name").asText(),
                "the tail of the bundle is where a head cut loses the most");
    }

    @Test
    void anOrdinaryOversizedResultIsStillBounded() {
        String content = contentOf("A".repeat(20000));

        assertTrue(content.contains("[truncated]"),
                "page reads and other bulk results keep the ordinary budget");
        assertTrue(content.length() < 13000);
    }

    @Test
    void aChineseBundleIsMeasuredInCharactersNotBytes() throws Exception {
        // The byte limiter and the char budget are different units: 24k chars of
        // Chinese schemas is ~65k bytes. Deciding "too big" on the byte count
        // would drop the schemas of a bundle that plainly fits the budget.
        Object result = bundle(40, 600, "参数说明文字");
        String content = contentOf(result);

        JsonNode payload = objectMapper.readTree(content);
        assertFalse(payload.path("schemasOmitted").asBoolean(),
                "a bundle within the char budget must be delivered, not degraded");
        assertEquals(40, payload.get(ClientToolActivation.FIELD).size());
    }

    @Test
    void aPayloadBeyondItsOwnBudgetNamesEveryToolInsteadOfCutting() throws Exception {
        // Larger than the discovery budget: the one case where the bundle genuinely
        // cannot travel. The answer must stay usable JSON, not a torn-off fragment.
        Object result = bundle(80, 2000);
        String content = contentOf(result);

        JsonNode payload = objectMapper.readTree(content);
        assertTrue(payload.path("schemasOmitted").asBoolean(),
                "the model must be told the specs did not come through");
        assertEquals(80, payload.path("toolNames").size(), "but every tool is still named");
        assertTrue(payload.path("note").asText().contains("首次调用"),
                "and it says how to get a schema anyway");
        assertFalse(content.contains("[truncated]"));
    }

    /** A skill bundle shaped like the real `load_skill` result. */
    private Object bundle(int toolCount, int schemaChars) {
        return bundle(toolCount, schemaChars, "schema padding ");
    }

    private Object bundle(int toolCount, int schemaChars, String filler) {
        List<Map<String, Object>> specs = new ArrayList<>();
        for (int i = 1; i <= toolCount; i++) {
            Map<String, Object> properties = new LinkedHashMap<>();
            properties.put("blockId", Collections.singletonMap("type", "string"));
            Map<String, Object> schema = new LinkedHashMap<>();
            schema.put("type", "object");
            schema.put("properties", properties);
            schema.put("description", filler.repeat(schemaChars / filler.length()));
            Map<String, Object> spec = new LinkedHashMap<>();
            spec.put("name", "tool" + i);
            spec.put("description", "tool " + i + " description");
            spec.put("inputSchema", schema);
            spec.put("kind", "frontend");
            spec.put("readOnly", false);
            spec.put("source", "client");
            specs.add(spec);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("skill", "document-editing");
        result.put(ClientToolActivation.FIELD, specs);
        return result;
    }

    /** Write one client tool result through the loop and return the tool message. */
    private String contentOf(Object result) {
        when(eventLog.append(anyString(), anyString(), any(Map.class)))
                .thenReturn(new RunEvent(1L, RunEvents.TOOL_COMPLETED, null, 0L));
        AgentRun run = AgentRun.create("run-1", "conv-1", 2L, 1L, "model", "execute", 1000L);
        run.setStatus(RunStatus.RUNNING.name());
        Checkpoint checkpoint = new Checkpoint();
        checkpoint.setRunId("run-1");
        checkpoint.setModel("model");
        checkpoint.setMessages(new ArrayList<>(List.of(
                ChatMessage.builder().role("system").content("sys").build())));
        checkpoint.setPendingToolCalls(new ArrayList<>(List.of(
                PendingToolCall.of("call-1", "load_skill", "{}", 1000L))));
        AgentLoop loop = new AgentLoop(run, checkpoint, null, null, null, eventLog,
                null, null, null, null, objectMapper, properties,
                null, null, new ResumeGate(), null, null);

        ResumePayload.ToolResultItem item = new ResumePayload.ToolResultItem();
        item.setCallId("call-1");
        item.setOk(true);
        item.setResult(result);
        loop.applyToolResults(List.of(item));

        List<ChatMessage> messages = checkpoint.getMessages();
        ChatMessage tool = messages.stream()
                .filter(message -> "tool".equals(message.getRole()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no tool message was written"));
        return tool.getContent();
    }
}
