package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.util.Date;

import cn.hutool.json.JSONObject;
import lombok.Data;

/**
 * Block Version Value Object for API responses.
 * Excludes internal entity fields (tenantId, isDeleted, updateUser, etc.)
 */
@Data
public class BlockVersionVO implements Serializable {

    private Long id;

    /**
     * Block ID
     */
    private String blockId;

    /**
     * Page ID
     */
    private Long pageId;

    /**
     * Linked page version ID
     */
    private Long pageVersionId;

    /**
     * Page version number (e.g., "1", "2")
     */
    private String pageVersion;

    /**
     * Block-level version number
     */
    private Integer version;

    /**
     * Block type (e.g., "paragraph", "heading")
     */
    private String type;

    /**
     * Block attributes
     */
    private JSONObject attrs;

    /**
     * Block text content
     */
    private String text;

    /**
     * Parent block ID
     */
    private String parentId;

    /**
     * Block path in document tree
     */
    private String path;

    /**
     * Sort order among siblings
     */
    private Integer sortOrder;

    /**
     * Creator user ID
     */
    private Long createUser;

    /**
     * Creation time
     */
    private Date createTime;

}
