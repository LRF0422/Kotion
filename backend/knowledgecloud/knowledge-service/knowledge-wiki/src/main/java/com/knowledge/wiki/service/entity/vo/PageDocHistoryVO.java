package com.knowledge.wiki.service.entity.vo;

import java.time.LocalDateTime;

import lombok.Data;

/** One materialised restore point in the new-store page history timeline. */
@Data
public class PageDocHistoryVO {

    private Long checkpointId;
    private Long rev;
    private String kind;
    private String label;
    private Long actor;
    private LocalDateTime createdAt;
    private Integer blockCount;
    private boolean current;
    private Long restoredFromRev;
}
