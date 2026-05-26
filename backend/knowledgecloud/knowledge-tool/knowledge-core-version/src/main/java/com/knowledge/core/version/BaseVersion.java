package com.knowledge.core.version;

import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public abstract class BaseVersion extends TenantEntity {

    private Long id;
    private String version;
    private Long subjectId;
    private VersionStatus status;
    private Long lastVersionId;
    private Long activeVersionId;

}
