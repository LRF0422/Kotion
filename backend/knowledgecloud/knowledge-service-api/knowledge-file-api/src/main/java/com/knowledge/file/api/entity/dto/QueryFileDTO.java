package com.knowledge.file.api.entity.dto;

import com.knowledge.core.common.base.PageDTO;
import com.knowledge.file.api.entity.enums.MediaType;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class QueryFileDTO extends PageDTO {

    private Long folderId;
    private MediaType mediaType;
    private String fileName;

}
