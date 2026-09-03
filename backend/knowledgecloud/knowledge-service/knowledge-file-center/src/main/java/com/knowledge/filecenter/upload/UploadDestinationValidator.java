package com.knowledge.filecenter.upload;

import org.springframework.stereotype.Component;

import com.knowledge.file.api.entity.enums.FileType;
import com.knowledge.filecenter.entity.KnowledgeFile;
import com.knowledge.filecenter.entity.KnowledgeFileRepository;
import com.knowledge.filecenter.service.IFileRepositoryService;
import com.knowledge.filecenter.service.IFileService;

import cn.hutool.core.util.StrUtil;
import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class UploadDestinationValidator {

    private final IFileRepositoryService repositoryService;
    private final IFileService fileService;

    public UploadDestination validate(UploadOwner owner, String requestedRepositoryKey, Long requestedParentId) {
        KnowledgeFileRepository repository;
        if (StrUtil.isBlank(requestedRepositoryKey)) {
            repository = repositoryService.getDefaultFileRepo();
            if (repository != null && !owner.getTenantId().equals(repository.getTenantId())) {
                throw new IllegalArgumentException("File repository not found");
            }
        } else {
            repository = repositoryService.lambdaQuery()
                    .eq(KnowledgeFileRepository::getTenantId, owner.getTenantId())
                    .eq(KnowledgeFileRepository::getRepoKey, requestedRepositoryKey)
                    .one();
        }
        if (repository == null || StrUtil.isBlank(repository.getRepoKey())) {
            throw new IllegalArgumentException("File repository not found");
        }
        if (repository.getAdmin() == null || !repository.getAdmin().equals(owner.getUserId())) {
            throw new IllegalStateException("Current user is not authorized to upload to this repository");
        }

        long parentId = requestedParentId == null ? 0L : requestedParentId;
        if (parentId != 0L) {
            KnowledgeFile parent = fileService.lambdaQuery()
                    .eq(KnowledgeFile::getId, parentId)
                    .eq(KnowledgeFile::getTenantId, owner.getTenantId())
                    .one();
            if (parent == null || parent.getType() != FileType.FOLDER
                    || Integer.valueOf(1).equals(parent.getTrashed())) {
                throw new IllegalArgumentException("Upload parent must be an active folder");
            }
            if (!repository.getRepoKey().equals(parent.getRepositoryKey())) {
                throw new IllegalArgumentException("Upload parent belongs to a different repository");
            }
        }
        return new UploadDestination(repository.getRepoKey(), parentId);
    }
}
