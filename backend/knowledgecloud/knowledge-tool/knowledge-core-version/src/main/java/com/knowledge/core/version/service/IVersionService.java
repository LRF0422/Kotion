package com.knowledge.core.version.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.github.yulichang.base.MPJBaseService;
import com.knowledge.core.version.BaseVersion;
import com.knowledge.core.version.BaseSubject;

public interface IVersionService<Subject extends BaseSubject, Version extends BaseVersion>
        extends MPJBaseService<Version> {

    Version createVersion(Subject subject, String lastVersion);

    Version getEditableVersion(Subject subject);

    void publish(Long versionId);

    boolean hasDraft(Long subjectId);

    Version getCurrentActiveVersion(Long subjectId);

    void rollBackToLastVersion(Long subjectId);

    boolean hasChange(Subject version);

    Version createOrSaveDraft(Subject subject);

    Version getDraftVersion(Long subjectId);

    Version getByPluginIdAndVersion(Long subjectId, String version);

}
