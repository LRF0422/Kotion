package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotNull;

import lombok.Data;

/**
 * Compare two versions request
 */
@Data
public class CompareVersionDTO implements Serializable {

    @NotNull(message = "源版本ID不能为空")
    private Long sourceVersionId;

    @NotNull(message = "目标版本ID不能为空")
    private Long targetVersionId;

}
