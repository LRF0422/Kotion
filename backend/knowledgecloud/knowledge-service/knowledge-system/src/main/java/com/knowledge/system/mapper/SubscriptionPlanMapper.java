package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.system.domain.SubscriptionPlan;

/**
 * 订阅方案 Mapper
 *
 * @author Kotion
 */
@InterceptorIgnore(tenantLine = "true")
public interface SubscriptionPlanMapper extends BaseMapper<SubscriptionPlan> {

}
