package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

import cn.hutool.json.JSONObject;
import lombok.Data;

/**
 * 块详细信息 VO
 * 包含块的完整上下文信息
 */
@Data
public class PageBlockDetailVO implements Serializable {

    /**
     * 块ID
     */
    private String id;

    /**
     * 块类型
     */
    private String type;

    /**
     * 块内容
     */
    private JSONObject content;

    /**
     * 文本内容
     */
    private String text;

    /**
     * 属性信息
     */
    private JSONObject attrs;

    /**
     * 标记信息
     */
    private List<JSONObject> marks;

    /**
     * 父块ID
     */
    private String parentId;

    /**
     * 所属页面ID
     */
    private Long pageId;

    /**
     * 页面标题
     */
    private String pageTitle;

    /**
     * 空间ID
     */
    private Long spaceId;

    /**
     * 空间名称
     */
    private String spaceName;

    /**
     * 块在文档树中的路径
     */
    private String path;

    /**
     * 完整路径标识
     */
    private String fullPath;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;

    /**
     * 创建用户ID
     */
    private Long createUser;

    /**
     * 更新用户ID
     */
    private Long updateUser;

    /**
     * 上下文信息 - 父级块链
     */
    private List<PageBlockDetailVO> parentChain;

    /**
     * 子块列表
     */
    private List<PageBlockDetailVO> children;

}