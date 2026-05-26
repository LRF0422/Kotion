package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotNull;

import lombok.Data;

/**
 * DTO for saving page content as individual blocks (block-first storage).
 */
@Data
public class SaveBlocksDTO implements Serializable {

    /**
     * Page ID
     */
    @NotNull(message = "页面ID不能为空")
    private Long pageId;

    /**
     * Full page content JSON (will be flattened into individual block rows)
     */
    private String content;

    /**
     * Whether to publish after saving
     */
    private boolean publish;
}
