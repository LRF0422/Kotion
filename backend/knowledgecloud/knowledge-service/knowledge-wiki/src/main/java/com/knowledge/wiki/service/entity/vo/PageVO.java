package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

import com.knowledge.core.common.base.Icon;
import com.knowledge.core.version.VersionStatus;
import com.knowledge.wiki.service.entity.enums.PageStatus;

import lombok.Data;

@Data
public class PageVO implements Serializable {

    private Long id;
    private Icon icon;
    private String title;
    private String description;
    private String ancestors;
    private Long spaceId;
    private Long parentId;
    private PageStatus status;
    private Boolean isTemplate = false;
    private String content;
    private boolean draft;
    private VersionStatus versionStatus;
    private boolean favorite;
    private Long createUser;
    private Long updateUser;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String cover;
    private List<PageVO> parents;
    private List<BacklinkVO> backlinks;
}
