package com.knowledge.filecenter.service;

import com.knowledge.core.common.base.IBaseService;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.filecenter.entity.KnowledgeFileRepository;

public interface IFileRepositoryService extends IBaseService<KnowledgeFileRepository> {

    KnowledgeFileRepository createOrSave(KnowledgeFileRepository repository);

    KnowledgeFileRepository getDefaultFileRepo();

    KnowledgeFileRepository initDefaultFileRepo(KnowledgeUser admin);

}
