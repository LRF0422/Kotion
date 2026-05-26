package com.knowledge.core.version.service;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.core.version.BaseSubject;

public interface ISubjectService<Subject extends BaseSubject> extends MPJBaseService<Subject> {

    void updateVersion(Long subjectId, Long activeVersionId);

}
