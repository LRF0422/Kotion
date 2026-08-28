package com.knowledge.system.domain.dto;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;

import lombok.Data;

@Data
public class OrganizationInviteDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @NotBlank(message = "账号不能为空")
    private String account;

    private String role = "ORG_MEMBER";
}
