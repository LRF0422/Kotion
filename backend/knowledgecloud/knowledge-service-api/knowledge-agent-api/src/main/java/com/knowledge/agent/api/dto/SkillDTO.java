package com.knowledge.agent.api.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ApiModel("Skill DTO")
public class SkillDTO {

    @ApiModelProperty("Unique skill identifier")
    private String skillId;

    @ApiModelProperty("Skill name")
    private String name;

    @ApiModelProperty("Description")
    private String description;

    @ApiModelProperty("Type: BUILTIN | PLUGIN | REMOTE")
    private String type;

    @ApiModelProperty("Version")
    private String version;

    @ApiModelProperty("Author")
    private String author;

    @ApiModelProperty("Whether the skill is enabled")
    private Boolean enabled;

    @ApiModelProperty("Installation status: UPLOADING | VALIDATING | INSTALLED | ENABLED")
    private String installStatus;

    @ApiModelProperty("Parameter definitions (JSON Schema)")
    private List<SkillParameterDTO> parameters;
}
