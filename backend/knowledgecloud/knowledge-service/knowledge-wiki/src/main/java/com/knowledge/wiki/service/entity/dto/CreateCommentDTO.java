package com.knowledge.wiki.service.entity.dto;

import java.util.List;
import lombok.Data;

/**
 * Create Comment Request DTO
 */
@Data
public class CreateCommentDTO {
    private Long pageId;
    private String content;
    private Long parentId;
    private List<Long> mentions;
}
