package com.knowledge.filecenter.service.impl;

import org.springframework.stereotype.Service;

import com.knowledge.core.common.base.BaseService;
import com.knowledge.filecenter.entity.KnowledgeUploadSession;
import com.knowledge.filecenter.mapper.UploadSessionMapper;
import com.knowledge.filecenter.service.IUploadSessionService;

@Service
public class UploadSessionServiceImpl extends BaseService<UploadSessionMapper, KnowledgeUploadSession>
        implements IUploadSessionService {
}
