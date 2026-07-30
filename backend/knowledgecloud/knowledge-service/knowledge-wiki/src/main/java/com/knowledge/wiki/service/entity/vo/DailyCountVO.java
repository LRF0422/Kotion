package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 按天统计视图对象（后台运营统计用）
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DailyCountVO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 日期（yyyy-MM-dd）
     */
    private String date;

    /**
     * 统计值
     */
    private Long value;
}
