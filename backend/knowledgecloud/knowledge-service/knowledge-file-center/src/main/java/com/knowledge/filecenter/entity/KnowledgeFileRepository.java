package com.knowledge.filecenter.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_file_repository")
public class KnowledgeFileRepository extends TenantEntity {

    private Long id;
    private String name;
    private String description;
    private Long admin;
    private String repoKey;
    private String icon;

}
