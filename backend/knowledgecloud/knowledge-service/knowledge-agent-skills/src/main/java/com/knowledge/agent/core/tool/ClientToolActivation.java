package com.knowledge.agent.core.tool;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Tool specs a CLIENT tool handed back in its result.
 *
 * <p>Progressive discovery, cache-safely: the client advertises only a small
 * essential tool set plus skill fragments that name the tools each skill owns. To
 * use one of those tools the model calls a discovery tool, whose executor returns
 * the missing schemas under {@link #FIELD}. The schemas travel as an appended tool
 * message, so the provider's cached prefix — which renders {@code tools} before the
 * messages — stays byte-identical. The loop then makes the listed tools routable
 * for the rest of the run through its deferred pool.
 *
 * <p>Deliberately keyed on a result FIELD rather than a tool name: any client tool
 * may hand over specs, and the loop stays ignorant of which one discovered what.
 *
 * <p>This is the IN-RUN handover only. A client that remembers the load per
 * conversation re-sends the same specs as {@code CreateRunRequest.deferredTools}
 * on the following turns, so those tools stay routable without a second discovery
 * round trip; the loop treats both arrivals identically.
 */
public final class ClientToolActivation {

    /** Result field carrying the specs: a list of OpenAI-shaped tool objects. */
    public static final String FIELD = "activateTools";

    private ClientToolActivation() {
    }

    /**
     * Extract the declared specs from a client tool result. Never throws: a
     * malformed payload yields an empty list, because a bad discovery result must
     * not fail the run.
     */
    public static List<ToolSpec> extract(Object result) {
        if (!(result instanceof Map)) {
            return Collections.emptyList();
        }
        Object raw = ((Map<?, ?>) result).get(FIELD);
        if (!(raw instanceof List)) {
            return Collections.emptyList();
        }
        List<ToolSpec> specs = new ArrayList<>();
        for (Object item : (List<?>) raw) {
            ToolSpec spec = toSpec(item);
            if (spec != null) {
                specs.add(spec);
            }
        }
        return specs;
    }

    /** One OpenAI-shaped tool object → {@link ToolSpec}; null when unusable. */
    private static ToolSpec toSpec(Object item) {
        if (!(item instanceof Map)) {
            return null;
        }
        Map<?, ?> map = (Map<?, ?>) item;
        String name = text(map.get("name"));
        if (name == null) {
            return null;
        }
        ToolSpec spec = new ToolSpec();
        spec.setName(name);
        spec.setDescription(text(map.get("description")));
        Object schema = map.get("inputSchema");
        if (schema instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> typed = (Map<String, Object>) schema;
            spec.setInputSchema(typed);
        }
        spec.setKind(ToolKind.FRONTEND.name());
        spec.setSource("client");
        spec.setReadOnly(Boolean.TRUE.equals(map.get("readOnly")));
        return spec;
    }

    private static String text(Object value) {
        if (value == null) {
            return null;
        }
        String trimmed = String.valueOf(value).trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
