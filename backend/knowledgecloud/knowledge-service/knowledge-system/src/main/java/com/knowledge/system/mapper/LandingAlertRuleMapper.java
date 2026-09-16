package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.system.domain.LandingAlertRule;

/**
 * 落地页指标告警规则 Mapper
 *
 * <p>全局表，无租户列，忽略租户行拦截器。</p>
 */
@InterceptorIgnore(tenantLine = "true")
public interface LandingAlertRuleMapper extends BaseMapper<LandingAlertRule> {
}
