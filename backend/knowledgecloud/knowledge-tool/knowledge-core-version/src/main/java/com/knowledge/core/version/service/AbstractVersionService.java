package com.knowledge.core.version.service;

import org.springframework.beans.factory.annotation.Autowired;

import com.github.yulichang.base.MPJBaseMapper;
import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.core.version.BaseVersion;
import com.knowledge.core.message.core.IEventBus;
import com.knowledge.core.version.BaseSubject;
import com.knowledge.core.version.VersionStatus;

public abstract class AbstractVersionService<Subject extends BaseSubject, Version extends BaseVersion, Mapper extends MPJBaseMapper<Version>>
        extends MPJBaseServiceImpl<Mapper, Version>
        implements IVersionService<Subject, Version> {

    @Override
    public Version getCurrentActiveVersion(Long subjectId) {
        return this.lambdaQuery().eq(Version::getSubjectId, subjectId)
                .eq(Version::getStatus, VersionStatus.ACTIVE)
                .one();
    }

    @Override
    public Version getEditableVersion(Subject subject) {
        Version draft = getDraftVersion(subject.getId());
        return draft == null ? getCurrentActiveVersion(subject.getId()) : draft;
    }

    @Override
    public void publish(Long versionId) {

        Version version = this.getById(versionId);
        Version current = getCurrentActiveVersion(version.getSubjectId());
        if (current != null) {
            this.lambdaUpdate()
                    .eq(BaseVersion::getId, versionId)
                    .set(BaseVersion::getLastVersionId, current.getId())
                    .set(BaseVersion::getVersion, Integer.parseInt(current.getVersion()) + 1)
                    .set(BaseVersion::getStatus, VersionStatus.ACTIVE)
                    .update();

            this.disableVersion(current.getId());
        } else {
            this.lambdaUpdate()
                    .eq(BaseVersion::getId, versionId)
                    .set(BaseVersion::getStatus, VersionStatus.ACTIVE)
                    .update();
        }
    }

    private void disableVersion(Long versionId) {
        this.lambdaUpdate()
                .eq(BaseVersion::getId, versionId)
                .set(BaseVersion::getStatus, VersionStatus.IN_ACTIVE)
                .update();
    }

    @Override
    public void rollBackToLastVersion(Long subjectId) {
        Version version = getCurrentActiveVersion(subjectId);
        if (version != null) {
            if (version.getLastVersionId() != null) {

            }
        }
    }

    @Override
    public boolean hasDraft(Long subjectId) {
        return this.getDraftVersion(subjectId) != null;
    }

    /**
     * 判断有没有草稿
     * 没有就新建
     * 有就更新内容
     */
    @Override
    public Version createOrSaveDraft(Subject subject) {
        Version currentActiveVersion = getCurrentActiveVersion(subject.getId());
        Version draftVersion = getDraftVersion(subject.getId());
        if (draftVersion == null && currentActiveVersion == null) {
            draftVersion = this.createVersion(subject, null);
            return draftVersion;
        } else if (draftVersion == null && currentActiveVersion != null) {
            draftVersion = this.createVersion(subject, currentActiveVersion.getVersion());
            return draftVersion;
        } else {
            updateDraft(subject, draftVersion);
            this.updateById(draftVersion);
            return draftVersion;
        }
    }

    @Override
    public Version getDraftVersion(Long subjectId) {
        return this.lambdaQuery()
                .eq(Version::getSubjectId, subjectId)
                .eq(Version::getStatus, VersionStatus.DRAFT)
                .one();
    }

    public abstract void updateDraft(Subject newValue, Version oldValue);

    @Override
    public Version getByPluginIdAndVersion(Long subjectId, String version) {
        if ("latest".equalsIgnoreCase(version)) {
            return getCurrentActiveVersion(subjectId);
        }
        return this.lambdaQuery()
                .eq(Version::getVersion, version)
                .one();
    }

}
