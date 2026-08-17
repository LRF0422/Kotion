package com.knowledge.agentcore.tool;

/**
 * Tool execution location.
 * <ul>
 *   <li>{@code BACKEND} — executed server-side inside the loop (web search,
 *       memory, delegate, ...).</li>
 *   <li>{@code FRONTEND} — executed by the client (editor operations); the run
 *       pauses in WAITING_TOOLS until the client resumes with a result.</li>
 * </ul>
 */
public enum ToolKind {
    BACKEND,
    FRONTEND
}
