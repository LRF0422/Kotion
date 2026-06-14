package com.knowledge.file.api.entity.dto;

import java.io.Serializable;

import lombok.Data;

@Data
public class RenameFileDTO implements Serializable {

    private Long id;
    private String newName;

}
