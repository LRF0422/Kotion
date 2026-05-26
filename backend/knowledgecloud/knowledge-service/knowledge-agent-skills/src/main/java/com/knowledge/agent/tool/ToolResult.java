package com.knowledge.agent.tool;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Tool execution result.
 * Indicates success or failure with the output.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ToolResult {

    @Builder.Default
    private boolean success = true;

    private String output;

    private String error;

    public static ToolResult success(String output) {
        return ToolResult.builder().success(true).output(output).build();
    }

    public static ToolResult error(String error) {
        return ToolResult.builder().success(false).error(error).build();
    }
}
