package com.knowledge.agent.core.tool;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Progressive discovery: a client tool result may carry the tool specs the model
 * was just taught, and the loop must turn them into routable client tools — with
 * their schema, so the call can actually be dispatched.
 */
class ClientToolActivationTest {

    private Map<String, Object> schema() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("bitableIndex", Collections.singletonMap("type", "number"));
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        return schema;
    }

    private Map<String, Object> tool(String name) {
        Map<String, Object> spec = new LinkedHashMap<>();
        spec.put("name", name);
        spec.put("description", name + " description");
        spec.put("inputSchema", schema());
        spec.put("readOnly", false);
        return spec;
    }

    private Map<String, Object> result(Object activateTools) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("skill", "bitable-ops");
        result.put(ClientToolActivation.FIELD, activateTools);
        return result;
    }

    @Test
    void extractsSpecsWithTheirSchema() {
        List<ToolSpec> specs = ClientToolActivation.extract(
                result(Arrays.asList(tool("addBitableRecord"), tool("insertBitable"))));

        assertEquals(Arrays.asList("addBitableRecord", "insertBitable"),
                Arrays.asList(specs.get(0).getName(), specs.get(1).getName()));
        assertEquals("FRONTEND", specs.get(0).getKind());
        assertEquals("client", specs.get(0).getSource());
        assertTrue(specs.get(0).getInputSchema().containsKey("properties"),
                "the schema must survive: the client dispatches the call with these arguments");
    }

    @Test
    void ignoresAnythingThatIsNotAnActivationPayload() {
        assertEquals(0, ClientToolActivation.extract(null).size());
        assertEquals(0, ClientToolActivation.extract("plain string result").size());
        assertEquals(0, ClientToolActivation.extract(Collections.singletonMap("success", true)).size());
        assertEquals(0, ClientToolActivation.extract(result("not-a-list")).size());
        assertEquals(0, ClientToolActivation.extract(result(Collections.emptyList())).size());
    }

    @Test
    void skipsUnusableEntriesButKeepsTheRest() {
        List<Object> mixed = new ArrayList<>();
        mixed.add(tool("goodTool"));
        mixed.add("junk");
        mixed.add(Collections.singletonMap("description", "no name"));
        mixed.add(Collections.singletonMap("name", "   "));
        Map<String, Object> noSchema = new LinkedHashMap<>();
        noSchema.put("name", "schemalessTool");
        mixed.add(noSchema);

        List<ToolSpec> specs = ClientToolActivation.extract(result(mixed));

        assertEquals(Arrays.asList("goodTool", "schemalessTool"),
                Arrays.asList(specs.get(0).getName(), specs.get(1).getName()));
        // A tool without a schema is still routable — the model saw whatever the
        // client sent, and the executor validates at call time.
        assertFalse(specs.get(1).getInputSchema() != null);
    }
}
