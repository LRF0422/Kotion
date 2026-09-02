package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

import com.knowledge.core.common.base.Icon;

import lombok.Data;

@Data
public class PageDTO implements Serializable {

    private Long id;
    @NotNull(message = "空间ID不能为空")
    private Long spaceId;
    @NotBlank(message = "页面标题不能为空")
    private String title;
    @Size(max = 191, message = "页面类型长度不能超过191个字符")
    private String pageType;
    private String content;
    private Boolean isDraft;
    private Long parentId;
    private Long templateId;
    private Icon icon;
    private String cover;

    private boolean publish = false;

}
