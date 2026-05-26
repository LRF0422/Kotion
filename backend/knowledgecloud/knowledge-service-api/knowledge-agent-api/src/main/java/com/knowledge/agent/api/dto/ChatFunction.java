package com.knowledge.agent.api.dto;

import com.fasterxml.jackson.annotation.JsonRawValue;

import cn.hutool.json.JSONObject;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Function definition within a tool.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ApiModel("Function definition")
public class ChatFunction {

    @ApiModelProperty("Function name")
    private String name;

    @ApiModelProperty("Function description")
    private String description;

    @ApiModelProperty("JSON Schema for function parameters (as raw JSON object)")
    private JSONObject parameters;

    @ApiModelProperty("Enable strict mode for structured outputs (optional)")
    private Boolean strict;

    @ApiModelProperty("Arguments (used in tool call responses)")
    private String arguments;
}
