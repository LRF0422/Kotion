package com.knowledge.wiki.service.entity.vo;

import java.util.List;

import lombok.Data;

/** Cursor page of materialised restore points. */
@Data
public class PageDocHistoryListVO {

    private Long currentRev;
    private int total;
    private Long nextBeforeRev;
    private List<PageDocHistoryVO> records;
}
