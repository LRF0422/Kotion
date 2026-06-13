package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;

import com.knowledge.core.common.base.Icon;

import lombok.Data;

@Data
public class BacklinkVO implements Serializable {

    private String sourceType;

    private String sourceId;

    private Long sourcePageId;

    private String sourcePageTitle;

    /** Space the source page lives in — required for cross-space navigation. */
    private String sourceSpaceId;

    private String sourceBlockId;

    private String snippet;

    private String linkKind;

    private Icon sourcePageIcon;
}
