package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.BaseEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_plugin_tag")
public class PluginTag extends BaseEntity {

    private Long id;
    private Long pluginId;
    private String color;
    private String content;

}
