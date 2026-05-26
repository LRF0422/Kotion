package com.knowledge.file.api.entity.dto;

import java.io.Serializable;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

@Data
@SuperBuilder
@AllArgsConstructor
@NoArgsConstructor
public class KnowledgeFileRepositoryDTO implements Serializable {

    private Long id;
    private String name;
    private String description;
    private Long admin;
    private String repoKey;
    private String icon;

}
