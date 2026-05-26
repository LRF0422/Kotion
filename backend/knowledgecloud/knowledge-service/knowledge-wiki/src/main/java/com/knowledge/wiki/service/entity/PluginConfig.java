package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Map;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "wiki_plugin_config", autoResultMap = true)
public class PluginConfig extends TenantEntity {

    private Long id;
    private Long userId;
    private String pluginKey;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> config;
}
