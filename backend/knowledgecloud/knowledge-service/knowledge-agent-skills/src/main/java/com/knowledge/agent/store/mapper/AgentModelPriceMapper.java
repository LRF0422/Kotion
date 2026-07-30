package com.knowledge.agent.store.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.store.entity.AgentModelPriceEntity;

/**
 * MyBatis-Plus mapper for {@link AgentModelPriceEntity}.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentModelPriceMapper extends BaseMapper<AgentModelPriceEntity> {
}
