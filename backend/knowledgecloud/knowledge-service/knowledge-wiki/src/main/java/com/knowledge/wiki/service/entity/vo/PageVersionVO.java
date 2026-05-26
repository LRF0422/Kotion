package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.util.Date;

import com.knowledge.core.version.VersionStatus;

import lombok.Data;

/**
 * Page Version Value Object for API responses.
 *
 * <p>
 * After the page/block refactor, page versions are metadata-only: actual
 * content is reconstructed from {@code wiki_page_block} (current state) or
 * {@code wiki_block_version} (historical snapshots). This VO no longer carries
 * the full content payload.
 * </p>
 */
@Data
public class PageVersionVO implements Serializable {

    private Long id;
    private Long subjectId;
    private String version;
    private VersionStatus status;
    private Long lastVersionId;
    private String title;
    private String description;
    private String md5Code;
    private String changeSummary;
    private Long createUser;
    private String createUserName;
    private Date createTime;
    private Date updateTime;
    private Boolean isActive;
    private Boolean isDraft;

}
