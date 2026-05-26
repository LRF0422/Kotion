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
@ApiModel("Agent role DTO (transient, for UI display)")
public class AgentRoleDTO {

    @ApiModelProperty("Role id (UUID, per-execution)")
    private String roleId;

    @ApiModelProperty("Role name, e.g. Researcher")
    private String name;

    @ApiModelProperty("System prompt / persona")
    private String persona;

    @ApiModelProperty("Skill ids assigned to this role")
    private List<String> skillIds;

    @ApiModelProperty("Max skill discovery tier: CORE | DOMAIN | ADVANCED | CUSTOM")
    private String maxTier;
}
