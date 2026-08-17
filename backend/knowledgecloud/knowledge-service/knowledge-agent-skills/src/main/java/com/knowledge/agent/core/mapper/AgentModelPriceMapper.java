package com.knowledge.agent.core.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.core.entity.AgentModelPriceEntity;

/**
 * MyBatis-Plus mapper for {@link AgentModelPriceEntity} (admin model pricing).
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentModelPriceMapper extends BaseMapper<AgentModelPriceEntity> {
}
