package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.system.domain.LandingSubscriberTagRel;

/**
 * 落地页订阅标签关联 Mapper
 *
 * <p>全局表，无租户列，忽略租户行拦截器。</p>
 */
@InterceptorIgnore(tenantLine = "true")
public interface LandingSubscriberTagRelMapper extends BaseMapper<LandingSubscriberTagRel> {
}
