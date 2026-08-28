package com.knowledge.system.domain.dto;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

import lombok.Data;

@Data
public class MeProfileUpdateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    @NotBlank(message = "显示名称不能为空")
    @Size(max = 64, message = "显示名称不能超过 64 个字符")
    private String name;

    @Size(max = 64, message = "真实姓名不能超过 64 个字符")
    private String realName;

    @Size(max = 512, message = "头像地址不能超过 512 个字符")
    private String avatar;
}
