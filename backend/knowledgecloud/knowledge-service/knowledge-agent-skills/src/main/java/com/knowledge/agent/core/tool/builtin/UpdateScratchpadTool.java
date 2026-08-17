package com.knowledge.agent.core.tool.builtin;

import com.knowledge.agent.core.tool.BackendTool;
import com.knowledge.agent.core.tool.ToolContext;
import com.knowledge.agent.core.tool.ToolKind;
import com.knowledge.agent.core.tool.ToolSpec;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Working-memory tool: the agent maintains a per-run scratchpad (persisted in
 * the checkpoint) across steps — notes, discovered facts, plan state.
 */
@Component
public class UpdateScratchpadTool implements BackendTool {

    @Override
    public ToolSpec spec() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("content", Schemas.str("Text to write into the scratchpad."));
        props.put("mode", Schemas.str("'replace' to overwrite or 'append' to add (default append)."));
        return ToolSpec.of("update_scratchpad",
                "Update the run's working memory scratchpad (replace or append). "
                        + "Use it to keep notes, findings and plan state across steps.",
                Schemas.object(props, "content"), ToolKind.BACKEND, false, "builtin");
    }

    @Override
    public Object execute(Map<String, Object> args, ToolContext context) {
        String content = args.get("content") == null ? "" : String.valueOf(args.get("content"));
        String mode = args.get("mode") == null ? "append" : String.valueOf(args.get("mode"));
        String current = context.getScratchpad().read();
        String next;
        if ("replace".equalsIgnoreCase(mode)) {
            next = content;
        } else {
            next = current.isEmpty() ? content : current + "\n" + content;
        }
        context.getScratchpad().write(next);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("scratchpad", next);
        return result;
    }
}
