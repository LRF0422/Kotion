package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;

import com.knowledge.core.common.base.Icon;

import lombok.Data;

@Data
public class SpaceDTO implements Serializable {

    private Long id;
    private Long userId;
    private String nickName;
    @NotBlank(message = "空间名称不能为空")
    private String name;
    private Icon icon;
    private String description;
    private String cover;

}
