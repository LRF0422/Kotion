package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.BaseEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_plugin_rating")
public class PluginRating extends BaseEntity {

    private Long id;
    private Long pluginId;
    private Long userId;
    private String userName;
    private Integer score;
}
