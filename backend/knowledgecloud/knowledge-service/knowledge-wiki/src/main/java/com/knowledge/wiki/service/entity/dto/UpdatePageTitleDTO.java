package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

import lombok.Data;

@Data
public class UpdatePageTitleDTO implements Serializable {

    @NotBlank(message = "页面标题不能为空")
    @Size(max = 100, message = "页面标题长度不能超过100个字符")
    private String title;

}
