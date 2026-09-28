package com.knowledge.agent.core.delegate;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * One entry of the plugin-agent directory (docs/plugin-agents.md) shipped with
 * a run by the client.
 *
 * <p>The frontend owns the declaration (a plugin's prompt + tool subset). It
 * travels with the run so a {@code delegate({ agentId })} call resolves the
 * child's persona and tools <em>here</em> instead of making the model copy a
 * long prompt and a tool-name list into its tool arguments — which was both
 * token-expensive and easy to paraphrase wrongly.
 *
 * <p>Frozen into the run checkpoint like the client tool catalog, so a
 * recovered loop delegates with exactly the directory the parent started with.
 */
@Data
public class PluginAgentSpec {

    /** Namespaced agent id, exactly as the kernel shows it to the model. */
    private String id;

    /** The agent's assembled system prompt (definition + surviving skills). */
    private String systemPrompt;

    /** Wire names of the tools that exist only inside this agent's child run. */
    private List<String> toolNames = new ArrayList<>();

    /** Optional cheaper model for this agent's child run. */
    private String model;
}
