package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;

import lombok.Data;

/**
 * TOP 空间统计视图对象（按页面数排序）
 */
@Data
public class TopSpaceVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long spaceId;

    private String spaceName;

    /**
     * 空间类型
     */
    private String type;

    /**
     * 有效页面数（不含回收站/已删除）
     */
    private Long pageCount;
}
