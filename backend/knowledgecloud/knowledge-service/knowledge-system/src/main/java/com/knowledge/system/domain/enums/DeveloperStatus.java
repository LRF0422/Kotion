package com.knowledge.system.domain.enums;

import com.knowledge.core.common.base.BaseEnum;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 开发者认证状态。
 *
 * <p>没有认证记录等价于「未提交」。只有 {@link #APPROVED} 才能发布 / 管理插件；
 * {@link #REJECTED} 与 {@link #SUSPENDED} 都允许开发者修改资料后重新提交。
 */
@Getter
@AllArgsConstructor
public enum DeveloperStatus implements BaseEnum<String> {

    PENDING("PENDING", "审核中"),
    APPROVED("APPROVED", "已认证"),
    REJECTED("REJECTED", "已驳回"),
    SUSPENDED("SUSPENDED", "已撤销");

    private final String value;
    private final String desc;
}
