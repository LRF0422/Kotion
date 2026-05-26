package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_link")
public class WikiLink extends TenantEntity {

    private Long id;

    /**
     * Source type: PAGE or BLOCK
     */
    private String sourceType;

    /**
     * Source identifier. For pages this is pageId as string, for blocks it is block
     * id.
     */
    private String sourceId;

    /**
     * Convenience field for the page that contains the source.
     */
    private Long sourcePageId;

    /**
     * Target type: PAGE or BLOCK
     */
    private String targetType;

    /**
     * Target identifier. For pages this is pageId as string, for blocks it is block
     * id.
     * May be null for unresolved links.
     */
    private String targetId;

    /**
     * Convenience field for the page that the target belongs to (if any).
     */
    private Long targetPageId;

    /**
     * Link kind, e.g. NORMAL, MENTION, EMBED.
     */
    private String linkKind;

    /**
     * Short text snippet around the link for display.
     */
    private String snippet;

}
