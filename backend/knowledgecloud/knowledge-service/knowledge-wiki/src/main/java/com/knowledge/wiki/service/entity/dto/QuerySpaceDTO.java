package com.knowledge.wiki.service.entity.dto;

import com.knowledge.core.common.base.PageDTO;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class QuerySpaceDTO extends PageDTO {

    private boolean template = false;
    private boolean favorite = false;

}
