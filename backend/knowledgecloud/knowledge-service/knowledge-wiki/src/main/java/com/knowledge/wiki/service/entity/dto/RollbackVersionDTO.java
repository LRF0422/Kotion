package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotNull;

import lombok.Data;

/**
 * Rollback version request
 */
@Data
public class RollbackVersionDTO implements Serializable {

    @NotNull(message = "页面ID不能为空")
    private Long pageId;

    @NotNull(message = "目标版本ID不能为空")
    private Long targetVersionId;

    private String changeSummary;

}
