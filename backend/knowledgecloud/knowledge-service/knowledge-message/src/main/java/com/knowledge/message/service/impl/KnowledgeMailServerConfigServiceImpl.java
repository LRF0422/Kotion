package com.knowledge.message.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.core.common.base.TenantItemImpl;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.message.domain.KnowledgeMailServerConfig;
import com.knowledge.message.mapper.KnowledgeMailServerConfigMapper;
import com.knowledge.message.service.IKnowledgeMailServiceConfigService;
import org.springframework.stereotype.Service;

@Service
public class KnowledgeMailServerConfigServiceImpl
        extends ServiceImpl<KnowledgeMailServerConfigMapper, KnowledgeMailServerConfig>
        implements IKnowledgeMailServiceConfigService {

    @Override
    public KnowledgeMailServerConfig getConfig() {
        return this.lambdaQuery().eq(TenantItemImpl::getTenantId, SecurityContextUtil.getTenantId()).one();
    }
}
