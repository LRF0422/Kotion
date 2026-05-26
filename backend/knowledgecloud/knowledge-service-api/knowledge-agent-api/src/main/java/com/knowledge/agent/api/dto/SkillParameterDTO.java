package com.knowledge.agent.api.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ApiModel("Skill parameter definition")
public class SkillParameterDTO {

    @ApiModelProperty("Parameter name")
    private String name;

    @ApiModelProperty("Parameter type: string | number | boolean | array | object")
    private String type;

    @ApiModelProperty("Description")
    private String description;

    @ApiModelProperty("Whether this parameter is required")
    private Boolean required;

    @ApiModelProperty("Default value")
    private Object defaultValue;
}
