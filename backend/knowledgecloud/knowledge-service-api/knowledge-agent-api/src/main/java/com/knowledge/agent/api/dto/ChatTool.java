package com.knowledge.agent.api.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * OpenAI-compatible tool definition.
 * Represented as: {"type": "function", "function": {"name": "...", "description": "...", "parameters": {...}}}
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ApiModel("Chat tool definition (OpenAI-compatible)")
public class ChatTool {

    @ApiModelProperty("Tool type (currently only 'function')")
    private String type;

    @ApiModelProperty("Function definition")
    private ChatFunction function;

    @ApiModelProperty("Whether this tool is read-only (safe to expose in PLAN mode)")
    private Boolean readOnly;
}
