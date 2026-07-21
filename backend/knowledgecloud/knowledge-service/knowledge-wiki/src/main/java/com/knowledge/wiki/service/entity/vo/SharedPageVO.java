package com.knowledge.wiki.service.entity.vo;

import java.time.LocalDateTime;

import lombok.Data;

/**
 * Read-only page payload returned when resolving a public share link.
 */
@Data
public class SharedPageVO {

    private Long pageId;
    private Long spaceId;
    private String title;
    private String content;
    /** Permission granted by the share link: READ / WRITE */
    private String permission;
    private LocalDateTime expiresAt;
    private LocalDateTime updateTime;
}
