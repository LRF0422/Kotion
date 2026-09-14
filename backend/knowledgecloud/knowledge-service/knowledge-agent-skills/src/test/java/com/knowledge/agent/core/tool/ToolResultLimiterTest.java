package com.knowledge.agent.core.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ToolResultLimiterTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void smallResultKeepsItsStructuredForm() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        assertSame(result, ToolResultLimiter.bound(result, mapper, 1000));
    }

    @Test
    void nullAndDisabledCapArePassthrough() {
        assertEquals(null, ToolResultLimiter.bound(null, mapper, 1000));
        Map<String, Object> result = Collections.singletonMap("a", "b");
        assertSame(result, ToolResultLimiter.bound(result, mapper, 0));
    }

    @Test
    void oversizedResultIsTruncatedAtTheCap() {
        List<String> huge = new ArrayList<>();
        for (int i = 0; i < 500; i++) {
            huge.add("block-" + i + "-" + "x".repeat(200));
        }
        Object bounded = ToolResultLimiter.bound(huge, mapper, 1000);

        assertTrue(bounded instanceof String, "oversized payload must degrade to text");
        String text = (String) bounded;
        assertTrue(text.endsWith("...[truncated]"));
        // Cap + suffix, with no unbounded growth.
        assertTrue(text.length() <= 1000 + "...[truncated]".length() + 2, "must stay near the cap");
    }
}
