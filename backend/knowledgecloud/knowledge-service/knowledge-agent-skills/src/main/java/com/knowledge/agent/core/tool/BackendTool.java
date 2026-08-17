package com.knowledge.agent.core.tool;

import java.util.Map;

/**
 * A server-executed tool. Implementations are Spring beans collected into the
 * {@link ToolGateway}; dependencies are injected at construction time.
 */
public interface BackendTool {

    ToolSpec spec();

    /** Execute with parsed JSON arguments; returns a JSON-serializable result. */
    Object execute(Map<String, Object> args, ToolContext context) throws Exception;
}
