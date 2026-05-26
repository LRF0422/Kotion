package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

import cn.hutool.json.JSONObject;
import lombok.Data;

/**
 * 更新块信息 DTO
 */
@Data
public class UpdateBlockDTO implements Serializable {

    /**
     * 块ID
     */
    @NotBlank(message = "块ID不能为空")
    private String blockId;

    /**
     * 页面ID
     */
    @NotNull(message = "页面ID不能为空")
    private Long pageId;

    /**
     * 新的内容
     */
    private JSONObject content;

    /**
     * 块类型
     */
    private String type;

    /**
     * 文本内容（如果适用）
     */
    private String text;

}