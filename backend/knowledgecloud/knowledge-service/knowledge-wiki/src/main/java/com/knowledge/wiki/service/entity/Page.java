package com.knowledge.wiki.service.entity;

import java.util.List;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.knowledge.core.common.base.Icon;
import com.knowledge.core.version.BaseSubject;
import com.knowledge.core.version.VersionStatus;
import com.knowledge.wiki.service.entity.enums.PageStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "wiki_page", autoResultMap = true)
public class Page extends BaseSubject {

    public final static Long TOP_PAGE_ID = 0L;
    public final static String UNTITLE = "未命名文档";

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Icon icon;
    private String title = UNTITLE;
    private String description;
    private String ancestors;
    private Long spaceId;
    private Long parentId = TOP_PAGE_ID;
    private PageStatus status;
    private Boolean isTemplate = false;
    private String cover;
    @TableField(exist = false)
    private String content;
    @TableField(exist = false)
    private boolean draft;
    @TableField(exist = false)
    private VersionStatus versionStatus;

    /**
     * Whether the page is pinned/featured in the space
     */
    private Boolean pinned;

    /**
     * Page tags (JSON array of strings)
     */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> tags;

}
