package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.wiki.service.entity.enums.InstalledPluginStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("wiki_installed_plugin")
@EqualsAndHashCode(callSuper = true)
public class InstalledPlugin extends TenantEntity {

    private Long id;
    private Long pluginId;
    private String pluginName;
    private String pluginVersion;
    private Long versionId;
    private InstalledPluginStatus status;

}
