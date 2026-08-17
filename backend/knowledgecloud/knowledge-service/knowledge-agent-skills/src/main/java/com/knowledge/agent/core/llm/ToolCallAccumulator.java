package com.knowledge.agent.core.llm;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Merges streaming tool-call fragments (OpenAI-compatible {@code tool_call}
 * deltas, which may omit the id on continuation chunks and carry only an
 * index) into complete {@link ToolCallRequest}s.
 */
public class ToolCallAccumulator {

    private final Map<Integer, ToolCallRequest> byIndex = new LinkedHashMap<>();
    private final Map<String, ToolCallRequest> byId = new LinkedHashMap<>();

    /** Apply one fragment: {@code id} may be null, {@code index} may be null. */
    public void onFragment(String id, String name, String argumentsDelta, Integer index) {
        ToolCallRequest target = null;
        if (id != null && byId.containsKey(id)) {
            target = byId.get(id);
        } else if (index != null && byIndex.containsKey(index)) {
            target = byIndex.get(index);
        }
        if (target == null) {
            // New call — register under both keys (whichever is present).
            String callId = id != null ? id : ("gen-" + (index != null ? index : byIndex.size()));
            target = ToolCallRequest.of(callId, null, "");
            if (id != null) {
                byId.put(id, target);
            }
            if (index != null) {
                byIndex.put(index, target);
            } else if (id == null) {
                byIndex.put(byIndex.size(), target);
            }
        }
        if (target.getName() == null && name != null && !name.isEmpty()) {
            target.setName(name);
        }
        if (argumentsDelta != null && !argumentsDelta.isEmpty()) {
            target.setArguments(target.getArguments() + argumentsDelta);
        }
    }

    /** All calls in first-seen order (deduplicated across id/index keys). */
    public List<ToolCallRequest> results() {
        Map<String, ToolCallRequest> seen = new LinkedHashMap<>();
        for (ToolCallRequest call : byIndex.values()) {
            seen.putIfAbsent(call.getId(), call);
        }
        for (ToolCallRequest call : byId.values()) {
            seen.putIfAbsent(call.getId(), call);
        }
        return new ArrayList<>(seen.values());
    }
}
