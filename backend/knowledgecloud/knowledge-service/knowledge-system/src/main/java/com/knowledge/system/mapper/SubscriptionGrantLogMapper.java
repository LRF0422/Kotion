package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.system.domain.SubscriptionGrantLog;

/**
 * 订阅授予日志 Mapper
 *
 * @author Kotion
 */
@InterceptorIgnore(tenantLine = "true")
public interface SubscriptionGrantLogMapper extends BaseMapper<SubscriptionGrantLog> {

}
