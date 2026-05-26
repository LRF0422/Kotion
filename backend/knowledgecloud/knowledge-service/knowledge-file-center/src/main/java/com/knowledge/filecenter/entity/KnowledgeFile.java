package com.knowledge.filecenter.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.file.api.entity.enums.FileType;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_file")
public class KnowledgeFile extends TenantEntity {

    private Long id;
    private FileType type;
    private String name;
    private String ancestors;
    private String path;
    private String suffix;
    private String fileKey;
    private String repositoryKey;
    private Long parentId;
    private Integer size;

}
