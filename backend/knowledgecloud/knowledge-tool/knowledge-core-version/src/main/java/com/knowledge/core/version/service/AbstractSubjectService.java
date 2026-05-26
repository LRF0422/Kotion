package com.knowledge.core.version.service;

import com.github.yulichang.base.MPJBaseMapper;
import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.core.version.BaseSubject;

public abstract class AbstractSubjectService<M extends MPJBaseMapper<Subject>, Subject extends BaseSubject>
        extends MPJBaseServiceImpl<M, Subject> implements ISubjectService<Subject> {

    @Override
    public void updateVersion(Long subjectId, Long activeVersionId) {
        this.lambdaUpdate()
                .eq(BaseSubject::getId, subjectId)
                .set(BaseSubject::getCurrentVersionId, activeVersionId)
                .update();
    }

}
