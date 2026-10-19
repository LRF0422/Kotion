package com.knowledge.system.domain.dto;

import com.knowledge.core.common.base.PageDTO;
import com.knowledge.system.domain.enums.DeveloperStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 后台开发者认证列表查询。
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class QueryDeveloperDTO extends PageDTO {

    private DeveloperStatus status;
}
