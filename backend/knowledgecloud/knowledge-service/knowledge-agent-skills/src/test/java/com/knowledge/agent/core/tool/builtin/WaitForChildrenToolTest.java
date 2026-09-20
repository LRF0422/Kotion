package com.knowledge.agent.core.tool.builtin;

import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolSpec;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@code wait_for_children} is the main agent's explicit "I need the sub-agent
 * results now" signal: read-only (plan mode allows it), optional filters, and
 * never executed as an ordinary backend tool (the loop owns it).
 */
class WaitForChildrenToolTest {

    private final WaitForChildrenTool tool = new WaitForChildrenTool();

    @Test
    @SuppressWarnings("unchecked")
    void advertisesOptionalFiltersAndStaysReadOnly() {
        ToolSpec spec = tool.spec();
        assertEquals("wait_for_children", spec.getName());
        assertTrue(spec.isReadOnly(), "waiting is read-only, so plan mode must allow it");
        assertEquals("builtin", spec.getSource());

        Map<String, Object> properties = (Map<String, Object>) spec.getInputSchema().get("properties");
        assertTrue(properties.containsKey("subRunIds"));
        assertTrue(properties.containsKey("timeoutSec"));
        assertFalse(spec.getInputSchema().containsKey("required"),
                "both filters must stay optional: the default is 'every live child'");
    }

    @Test
    void cannotBeExecutedOutsideTheLoop() {
        assertThrows(IllegalStateException.class,
                () -> tool.execute(Collections.emptyMap(), new ToolContext()),
                "a bypassed interception must fail loudly, not report a fake success");
    }
}
