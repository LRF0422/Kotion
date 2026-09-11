package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

import lombok.Data;

@Data
public class PluginSuspendDTO implements Serializable {

    @NotBlank(message = "下架原因不能为空")
    @Size(max = 500, message = "下架原因长度不能超过500")
    private String reason;
}
