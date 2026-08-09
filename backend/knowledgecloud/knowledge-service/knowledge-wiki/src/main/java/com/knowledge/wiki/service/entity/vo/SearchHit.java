package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;

import lombok.Data;

/**
 * Search hit returned by
 * {@link com.knowledge.wiki.service.search.WikiSearchService}.
 * Represents a single RediSearch result for a wiki block.
 */
@Data
public class SearchHit implements Serializable {

    private String blockId;
    private Long pageId;
    private Long spaceId;
    private String pageTitle;
    private String text;
    private String type;
    private String status;
    private long updateTime;

}
