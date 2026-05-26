package com.knowledge.agent.api.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Tool DTO (replaces SkillDTO).
 * Represents a tool in the agent system.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ApiModel("Tool DTO")
public class ToolDTO {

    @ApiModelProperty("Unique tool identifier")
    private String toolId;

    @ApiModelProperty("Tool name")
    private String name;

    @ApiModelProperty("Description")
    private String description;

    @ApiModelProperty("Type: BUILTIN | REMOTE")
    private String type;

    @ApiModelProperty("Version")
    private String version;

    @ApiModelProperty("Author")
    private String author;

    @ApiModelProperty("Whether the tool is enabled")
    private Boolean enabled;

    @ApiModelProperty("Installation status: UPLOADING | VALIDATING | INSTALLED | ENABLED")
    private String installStatus;

    @ApiModelProperty("Parameter definitions (JSON Schema)")
    private List<ToolParameterDTO> parameters;
}
