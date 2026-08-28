package com.knowledge.system.domain.dto;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;

import lombok.Data;

@Data
public class OrganizationMemberRoleDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @NotBlank(message = "角色不能为空")
    private String role;
}
