package com.knowledge.message.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.knowledge.message.domain.KnowledgeMailServerConfig;

public interface IKnowledgeMailServiceConfigService extends IService<KnowledgeMailServerConfig> {

    KnowledgeMailServerConfig getConfig();
}
