package com.knowledge.filecenter.service.impl;

import org.springframework.stereotype.Service;

import com.knowledge.core.common.base.BaseService;
import com.knowledge.filecenter.entity.KnowledgeUploadPart;
import com.knowledge.filecenter.mapper.UploadPartMapper;
import com.knowledge.filecenter.service.IUploadPartService;

@Service
public class UploadPartServiceImpl extends BaseService<UploadPartMapper, KnowledgeUploadPart>
        implements IUploadPartService {
}
