package com.knowledge.core.version.vo;

import java.io.Serializable;

import com.knowledge.core.version.VersionStatus;

import lombok.Data;

@Data
public abstract class BaseSubjectVO implements Serializable {

    private VersionStatus versionStatus;

}
