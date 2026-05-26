package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;

import lombok.Data;

/**
 * Version comparison result
 */
@Data
public class PageVersionDiffVO implements Serializable {

    private Long sourceVersionId;
    private String sourceVersion;
    private String sourceContent;

    private Long targetVersionId;
    private String targetVersion;
    private String targetContent;

    private String diffHtml;
    private Integer addedLines;
    private Integer deletedLines;
    private Integer modifiedLines;

}
