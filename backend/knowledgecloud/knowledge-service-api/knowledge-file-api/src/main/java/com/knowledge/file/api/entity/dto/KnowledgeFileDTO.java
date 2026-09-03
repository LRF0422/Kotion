package com.knowledge.file.api.entity.dto;

import java.io.Serializable;

import com.knowledge.file.api.entity.enums.FileType;

import lombok.Data;

@Data
public class KnowledgeFileDTO implements Serializable {

    private Long id;
    private FileType type;
    private String name;
    private Long parentId;
    private String path;
    private String suffix;
    private Long size;
    private String fileKey;
    private String repositoryKey;

}
