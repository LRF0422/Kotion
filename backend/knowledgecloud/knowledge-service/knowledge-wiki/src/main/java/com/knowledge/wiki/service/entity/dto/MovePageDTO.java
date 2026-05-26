package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotNull;

import lombok.Data;

/**
 * DTO for moving a page to a different parent or space.
 */
@Data
public class MovePageDTO implements Serializable {

    /**
     * Target space ID (null means same space)
     */
    private Long targetSpaceId;

    /**
     * Target parent page ID (0 means top-level)
     */
    @NotNull(message = "目标父页面ID不能为空")
    private Long targetParentId;

}
