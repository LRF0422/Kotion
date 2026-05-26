package com.knowledge.agent.registry;

import com.knowledge.agent.tool.Tool;
import com.knowledge.agent.tool.ToolContext;
import com.knowledge.agent.tool.ToolResult;
import lombok.extern.slf4j.Slf4j;

/**
 * Adapter that wraps a RemoteToolRecord as a Tool interface.
 * Handles invocation of remote tools via the RemoteToolInvoker.
 */
@Slf4j
public class RemoteToolAdapter implements Tool {

    private final RemoteToolRecord record;
    private RemoteToolInvoker invoker;

    public RemoteToolAdapter(RemoteToolRecord record) {
        this.record = record;
    }

    public void setInvoker(RemoteToolInvoker invoker) {
        this.invoker = invoker;
    }

    public String getServiceId() {
        return record.getServiceId();
    }

    public String getSkillId() {
        return record.getSkillId();
    }

    public RemoteToolRecord getRecord() {
        return record;
    }

    @Override
    public String getId() {
        return record.getToolId();
    }

    @Override
    public String getDescription() {
        return record.getDescription();
    }

    @Override
    public String getJsonSchema() {
        return record.getParameterSchema();
    }

    @Override
    public ToolResult execute(ToolContext context, String args) {
        if (invoker == null) {
            return ToolResult.error("Remote tool invoker not configured for tool: " + record.getToolId());
        }
        try {
            // Forward the user's JWT token for authentication on the remote service
            String token = context != null ? context.getToken() : null;
            return invoker.invoke(record.getServiceId(), record.getSkillId(), record.getToolId(), args, token);
        } catch (Exception e) {
            log.error("Remote tool invocation failed: {}/{}::{}", record.getServiceId(), record.getSkillId(),
                    record.getToolId(), e);
            return ToolResult.error("Remote invocation failed: " + e.getMessage());
        }
    }
}
