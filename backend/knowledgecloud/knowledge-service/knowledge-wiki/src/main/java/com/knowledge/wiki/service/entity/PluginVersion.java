package com.knowledge.wiki.service.entity;

import java.util.List;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.version.BaseVersion;
import com.knowledge.wiki.service.typeHandler.VersionDescListTypeHandler;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "wiki_plugin_version", autoResultMap = true)
public class PluginVersion extends BaseVersion {

    private String resourcePath;
    /**
     * Subresource Integrity hash of the plugin artifact (e.g. sha384-xxx),
     * submitted by the publisher together with resourcePath.
     */
    private String integrity;
    @TableField(typeHandler = VersionDescListTypeHandler.class)
    private List<VersionDesc> versionDescription;

    @TableField(exist = false)
    private String icon;
    @TableField(exist = false)
    private String name;
    @TableField(exist = false)
    private String description;
    @TableField(exist = false)
    private String developer;
    @TableField(exist = false)
    private String maintainer;
    @TableField(exist = false)
    private Long maintainerId;
    @TableField(exist = false)
    private String pluginKey;

}
