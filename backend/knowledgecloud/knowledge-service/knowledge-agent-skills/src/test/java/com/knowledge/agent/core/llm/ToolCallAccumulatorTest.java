package com.knowledge.agent.core.llm;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Streaming tool-call fragment merging: id-keyed, index-keyed and mixed
 * continuation chunks must assemble into complete calls in first-seen order.
 */
class ToolCallAccumulatorTest {

    @Test
    void mergesFragmentsById() {
        ToolCallAccumulator accumulator = new ToolCallAccumulator();
        accumulator.onFragment("call-1", "web_search", "{\"query\":\"", 0);
        accumulator.onFragment("call-1", null, "hello\"}", 0);
        List<ToolCallRequest> calls = accumulator.results();
        assertEquals(1, calls.size());
        assertEquals("call-1", calls.get(0).getId());
        assertEquals("web_search", calls.get(0).getName());
        assertEquals("{\"query\":\"hello\"}", calls.get(0).getArguments());
    }

    @Test
    void mergesFragmentsByIndexWhenIdMissingOnContinuation() {
        ToolCallAccumulator accumulator = new ToolCallAccumulator();
        accumulator.onFragment("call-a", "editor.read", "{\"range\":", 0);
        // DeepSeek-style continuation chunk: index only, no id.
        accumulator.onFragment(null, null, "\"whole\"}", 0);
        List<ToolCallRequest> calls = accumulator.results();
        assertEquals(1, calls.size());
        assertEquals("call-a", calls.get(0).getId());
        assertEquals("editor.read", calls.get(0).getName());
        assertEquals("{\"range\":\"whole\"}", calls.get(0).getArguments());
    }

    @Test
    void handlesMultipleParallelCalls() {
        ToolCallAccumulator accumulator = new ToolCallAccumulator();
        accumulator.onFragment("a", "delegate", "{\"task\":\"one", 0);
        accumulator.onFragment("b", "delegate", "{\"task\":\"two", 1);
        accumulator.onFragment(null, null, "\"}", 0);
        accumulator.onFragment(null, null, "\"}", 1);
        List<ToolCallRequest> calls = accumulator.results();
        assertEquals(2, calls.size());
        assertEquals("{\"task\":\"one\"}", calls.get(0).getArguments());
        assertEquals("{\"task\":\"two\"}", calls.get(1).getArguments());
    }
}
