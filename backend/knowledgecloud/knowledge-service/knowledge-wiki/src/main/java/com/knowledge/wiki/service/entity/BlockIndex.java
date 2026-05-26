package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 块索引表实体
 * 用于快速定位块在哪个页面及位置
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_block_index")
public class BlockIndex extends TenantEntity {

    private Long id;
    /**
     * 块ID
     */
    private String blockId;

    /**
     * 所属页面ID
     */
    private Long pageId;

    /**
     * 块类型
     */
    private String type;

    /**
     * 块在文档树中的路径
     */
    private String path;

    /**
     * 块内容摘要（用于搜索和显示）
     */
    private String contentSummary;

    /**
     * 是否为叶子节点
     */
    private Boolean isLeaf;

    /**
     * 父块ID
     */
    private String parentId;

    /**
     * 页面版本ID
     */
    private Long pageVersionId;

}