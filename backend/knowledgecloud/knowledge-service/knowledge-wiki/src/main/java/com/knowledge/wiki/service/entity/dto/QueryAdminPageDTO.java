package com.knowledge.wiki.service.entity.dto;

import com.knowledge.wiki.service.entity.enums.PageStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 后台页面治理查询 DTO（支持状态/空间/创建人/时间范围筛选）
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class QueryAdminPageDTO extends com.knowledge.core.common.base.PageDTO {

    private PageStatus status;

    private Long spaceId;

    /**
     * 创建人用户 id
     */
    private Long createUser;

    /**
     * 创建时间起（yyyy-MM-dd，含当天）
     */
    private String startTime;

    /**
     * 创建时间止（yyyy-MM-dd，含当天）
     */
    private String endTime;
}
