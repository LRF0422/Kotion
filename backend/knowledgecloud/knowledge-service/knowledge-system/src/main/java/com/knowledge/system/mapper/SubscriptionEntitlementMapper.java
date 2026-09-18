package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.system.domain.SubscriptionEntitlement;

/**
 * 权益定义 Mapper
 *
 * @author Kotion
 */
@InterceptorIgnore(tenantLine = "true")
public interface SubscriptionEntitlementMapper extends BaseMapper<SubscriptionEntitlement> {

}
