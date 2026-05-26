package com.knowledge.filecenter.service.impl;

import org.springframework.stereotype.Service;

import com.knowledge.core.common.base.BaseService;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.filecenter.converter.KnowledgeFileRepositoryConverter;
import com.knowledge.filecenter.entity.KnowledgeFileRepository;
import com.knowledge.filecenter.mapper.FileRepositoryMapper;
import com.knowledge.filecenter.service.IFileRepositoryService;

@Service
public class FileRepositoryServiceImpl extends BaseService<FileRepositoryMapper, KnowledgeFileRepository>
        implements IFileRepositoryService {

    @Override
    public KnowledgeFileRepository createOrSave(KnowledgeFileRepository repository) {

        if (repository.getId() != null) {
            KnowledgeFileRepository db = this.getById(repository.getId());
            KnowledgeFileRepositoryConverter.INSTANCE.update(repository, db);
            this.updateById(db);
        } else {
            this.save(repository);
        }
        return repository;
    }

    @Override
    public KnowledgeFileRepository getDefaultFileRepo() {
        KnowledgeFileRepository repository = getByTenantId();
        if (repository == null) {
            return initDefaultFileRepo(SecurityContextUtil.getUser());
        }
        return repository;
    }

    private KnowledgeFileRepository getByTenantId() {
        return this.lambdaQuery()
                .eq(KnowledgeFileRepository::getRepoKey, SecurityContextUtil.getTenantId())
                .one();
    }

    @Override
    public KnowledgeFileRepository initDefaultFileRepo(KnowledgeUser admin) {
        KnowledgeFileRepository defaultRepo = new KnowledgeFileRepository();
        defaultRepo.setRepoKey(SecurityContextUtil.getTenantId());
        defaultRepo.setAdmin(admin.getId());
        this.save(defaultRepo);
        return defaultRepo;
    }

}
