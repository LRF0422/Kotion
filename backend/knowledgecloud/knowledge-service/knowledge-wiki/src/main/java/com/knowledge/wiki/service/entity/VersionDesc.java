package com.knowledge.wiki.service.entity;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;

import lombok.Data;

@Data
public class VersionDesc implements Serializable {

    @NotBlank(message = "版本说明标签不能为空")
    @Size(max = 50, message = "版本说明标签长度不能超过50")
    private String label;
    @NotBlank(message = "版本说明内容不能为空")
    @Size(max = 100000, message = "版本说明内容过长")
    private String content;

}
