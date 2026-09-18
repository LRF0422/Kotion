package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.system.domain.SubscriptionPlanEntitlement;

/**
 * 方案权益取值 Mapper
 *
 * @author Kotion
 */
@InterceptorIgnore(tenantLine = "true")
public interface SubscriptionPlanEntitlementMapper extends BaseMapper<SubscriptionPlanEntitlement> {

}
