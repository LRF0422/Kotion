package com.knowledge.filecenter.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.file.api.entity.enums.FileType;
import com.knowledge.file.api.entity.enums.MediaType;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_file")
public class KnowledgeFile extends TenantEntity {

    private Long id;
    private FileType type;
    private MediaType mediaType;
    private String name;
    private String ancestors;
    private String path;
    private String suffix;
    private String fileKey;
    private String repositoryKey;
    private Long parentId;
    private Long size;
    private Long uploadSessionId;

    /** 回收站标记:0=正常 1=已删除(可还原) */
    private Integer trashed;
    private LocalDateTime trashedTime;

    /** 收藏标记:0=否 1=是 */
    private Integer favorite;

    /** 最近访问时间 */
    private LocalDateTime lastAccessedTime;

}
