package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;

import lombok.Data;

/**
 * 空间后台详情视图对象（含成员数/页面数）
 */
@Data
public class AdminSpaceDetailVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 空间基本信息
     */
    private SpaceVO space;

    /**
     * 成员数
     */
    private Integer memberCount;

    /**
     * 有效页面数（不含回收站/已删除）
     */
    private Long pageCount;
}
