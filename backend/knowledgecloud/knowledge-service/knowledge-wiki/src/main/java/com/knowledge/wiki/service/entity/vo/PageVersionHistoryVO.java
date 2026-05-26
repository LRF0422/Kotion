package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.util.Date;

import com.knowledge.core.version.VersionStatus;

import lombok.Data;

/**
 * Simplified Page Version History for timeline display
 */
@Data
public class PageVersionHistoryVO implements Serializable {

    private Long id;
    private String version;
    private VersionStatus status;
    private String changeSummary;
    private Long createUser;
    private String createUserName;
    private Date createTime;
    private Boolean isActive;
    private Boolean isDraft;
    private Integer contentSize;

}
