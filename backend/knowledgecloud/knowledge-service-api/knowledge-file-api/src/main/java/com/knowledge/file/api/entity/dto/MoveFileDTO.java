package com.knowledge.file.api.entity.dto;

import java.io.Serializable;

import lombok.Data;

@Data
public class MoveFileDTO implements Serializable {

    private Long sourceId;
    private Long targetId;
    
}
