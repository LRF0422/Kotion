package com.knowledge.system.domain.dto;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

import lombok.Data;

@Data
public class OrganizationCreateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @NotBlank(message = "组织名称不能为空")
    @Size(max = 100, message = "组织名称不能超过 100 个字符")
    private String name;
}
