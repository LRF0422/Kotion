package com.knowledge.filecenter.entity.vo;

import java.io.Serializable;
import java.util.Date;

import com.knowledge.file.api.entity.enums.FileType;
import com.knowledge.file.api.entity.enums.MediaType;

import lombok.Data;

@Data
public class KnowledgeFileVO implements Serializable {

    private Long id;
    private FileType type;
    private MediaType mediaType;
    private String name;
    private Long parentId;
    private String path;
    private String suffix;
    private Long size;
    private Long uploadSessionId;
    private String key;
    private Long repositoryId;
    private String repositoryKey;
    private String ancestors;
    private Date createTime;
    private Date updateTime;
    private String fileKey;

    private Integer trashed;
    private Date trashedTime;
    private Integer favorite;
    private Date lastAccessedTime;

}
