package com.knowledge.wiki.service.entity;

import java.util.List;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.FastjsonTypeHandler;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.wiki.service.typeHandler.MarkListTypeHandler;
import com.knowledge.wiki.service.typeHandler.PageContgentListTypehandler;

import cn.hutool.json.JSONObject;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Block version snapshot entity.
 * Each row represents the state of a block at a specific page version.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "wiki_block_version", autoResultMap = true)
public class BlockVersion extends TenantEntity {

    private Long id;

    /**
     * Block ID (references wiki_page_block.id)
     */
    private String blockId;

    /**
     * Page ID
     */
    private Long pageId;

    /**
     * Linked page version ID (set when page is published)
     */
    private Long pageVersionId;

    /**
     * Page version number (e.g., "1", "2") for querying blocks by page version
     */
    private String pageVersion;

    /**
     * Block-level version number
     */
    private Integer version;

    /**
     * Change action: create / update / delete
     */
    private String changeAction;

    /**
     * Previous block version number (null for create).
     * Used for optimistic concurrency / change-history navigation.
     */
    private Integer prevVersion;

    private String type;

    @TableField(typeHandler = FastjsonTypeHandler.class)
    private JSONObject attrs;

    @TableField(typeHandler = PageContgentListTypehandler.class)
    private List<PageContent> content;

    @TableField(typeHandler = MarkListTypeHandler.class)
    private List<Mark> marks;

    private String text;
    private String parentId;
    private String path;
    private Integer sortOrder;

}
