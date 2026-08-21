package com.knowledge.wiki.service.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;

/**
 * Per-page version pointer and write serialisation point.
 * <p>
 * Every write transaction opens by selecting this page's row {@code FOR UPDATE}.
 * That turns same-page writes into a queue at the cost of a single row lock,
 * while writes to different pages never contend.
 * </p>
 */
@Data
@TableName("wiki_page_head")
public class PageHead {

    @TableId(value = "page_id", type = IdType.INPUT)
    private Long pageId;

    /**
     * Monotonically increasing; every accepted op batch advances it by one.
     */
    private Long rev;

    private Long lastActor;

    private LocalDateTime updatedAt;

}
