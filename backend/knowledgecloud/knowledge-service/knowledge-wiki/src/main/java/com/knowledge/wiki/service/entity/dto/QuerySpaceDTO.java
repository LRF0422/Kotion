package com.knowledge.wiki.service.entity.dto;

import com.knowledge.core.common.base.PageDTO;
import com.knowledge.wiki.service.entity.enums.SpaceType;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class QuerySpaceDTO extends PageDTO {

    private boolean template = false;
    private boolean favorite = false;

    /**
     * Filter by space type (SPACE, COLLABORATION, etc.)
     * When null, returns both SPACE and COLLABORATION types.
     */
    private SpaceType type;

    /**
     * Search keyword for space name
     */
    private String searchValue;

    /**
     * When true, list only archived spaces; otherwise archived spaces
     * are excluded from the results.
     */
    private Boolean archived;

}
