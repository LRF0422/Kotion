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
        // The marker counts against the cap: an output one marker longer than the
        // cap is re-cut by the character-based L1 pruner, which drops the marker.
        assertTrue(text.length() <= 1000, "must never exceed the char cap, marker included");
    }

    /**
     * The truncated marker must survive the reader-side pruner: the writer keeps
     * its output inside the same character budget L1 compares against. When it
     * did not, an ASCII result came out one marker ABOVE the cap, L1 cut it again
     * and the model was handed a silently incomplete result.
     */
    @Test
    void asciiResultSitsAtOrBelowTheCapSoL1LeavesItAlone() {
        int maxChars = 1000;
        Object bounded = ToolResultLimiter.bound("x".repeat(5000), mapper, maxChars);

        String text = (String) bounded;
        assertTrue(text.length() <= maxChars,
                "an ASCII result must not overshoot the cap by the marker length");
        assertTrue(ToolResultLimiter.isTruncated(text));
    }

    @Test
    void truncateTextCountsTheMarkerAgainstTheCap() {
        String text = ToolResultLimiter.truncateText("y".repeat(500), 100);
        assertTrue(text.length() <= 100, "the marker is part of the budget");
        assertTrue(ToolResultLimiter.isTruncated(text));

        // Under the cap, and with the cap disabled, the input is returned as is.
        assertEquals("short", ToolResultLimiter.truncateText("short", 100));
        assertEquals("z".repeat(500), ToolResultLimiter.truncateText("z".repeat(500), 0));
    }
}
