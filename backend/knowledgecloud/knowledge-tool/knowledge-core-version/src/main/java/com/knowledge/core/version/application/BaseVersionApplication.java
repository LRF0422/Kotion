package com.knowledge.core.version.application;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.core.version.BaseVersion;
import com.knowledge.core.version.BaseSubject;
import com.knowledge.core.version.dto.BaseSubjectDTO;
import com.knowledge.core.version.dto.BaseVersionDTO;
import com.knowledge.core.version.vo.BaseSubjectVO;
import com.knowledge.core.version.vo.BaseVersionVO;
import com.knowledge.core.version.service.IVersionService;
import com.knowledge.core.version.service.ISubjectService;

@Transactional(rollbackFor = Exception.class)
public abstract class BaseVersionApplication<Subject extends BaseSubject, SubjectDTO extends BaseSubjectDTO, SubjectVO extends BaseSubjectVO, Version extends BaseVersion, VersionVO extends BaseVersionVO, VersionDTO extends BaseVersionDTO, SubjectService extends ISubjectService<Subject>, VersionService extends IVersionService<Subject, Version>> {

    @Autowired
    protected SubjectService subjectService;
    @Autowired
    protected VersionService versionService;

    public void publish(Long subjectId) {
        Subject subject = this.subjectService.getById(subjectId);
        Version version = this.versionService.getDraftVersion(subjectId);
        if (version != null) {
            versionService.publish(version.getId());
            subjectService.updateVersion(subject.getId(), version.getId());
        }
    }

    public Subject createSubject(SubjectDTO dto) {
        Subject subject = getSubjectConverter().convertDO(dto);
        beforeCreate(dto, subject);
        if (subject.getId() != null) {
            Subject db = this.subjectService.getById(subject.getId());
            getSubjectConverter().update(subject, db);
            this.subjectService.updateById(db);
            if (this.versionService.hasChange(subject)) {
                this.versionService.createOrSaveDraft(db);
            }
        } else {
            beforeUpdate(dto, subject);
            this.subjectService.save(subject);
            versionService.createVersion(subject, "0");
        }
        if (dto.isPublish()) {
            this.publish(subject.getId());
        }
        return subject;

    }

    public Version getSubjectCurrentVersion(Long subjectId) {
        return versionService.getCurrentActiveVersion(subjectId);
    }

    protected void beforeUpdate(SubjectDTO dto, Subject subject) {

    }

    protected void beforeCreate(SubjectDTO dto, Subject subject) {

    }

    public abstract IConverter<Subject, SubjectDTO, SubjectVO> getSubjectConverter();

    public abstract IConverter<Version, VersionDTO, VersionVO> getVersionConverter();
}
