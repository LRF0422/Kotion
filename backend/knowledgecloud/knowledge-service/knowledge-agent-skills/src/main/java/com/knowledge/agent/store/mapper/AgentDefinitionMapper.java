package com.knowledge.agent.store.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.agent.store.entity.AgentDefinitionEntity;

/**
 * MyBatis-Plus mapper for {@link AgentDefinitionEntity}.
 *
 * <p>
 * Bypasses the tenant-line interceptor — tenant isolation is applied
 * explicitly in {@code AgentDefinitionService} query conditions, keeping
 * this mapper consistent with the other agent store mappers.
 */
@InterceptorIgnore(tenantLine = "true")
public interface AgentDefinitionMapper extends BaseMapper<AgentDefinitionEntity> {
}
