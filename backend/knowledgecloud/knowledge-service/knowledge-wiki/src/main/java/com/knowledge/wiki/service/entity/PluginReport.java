package com.knowledge.wiki.service.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.BaseEntity;
import com.knowledge.wiki.service.entity.enums.PluginReportReason;
import com.knowledge.wiki.service.entity.enums.PluginReportStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_plugin_report")
public class PluginReport extends BaseEntity {

    private Long id;
    private Long pluginId;
    private Long versionId;
    private PluginReportReason reasonType;
    private String reasonText;
    private Long reporterId;
    private String reporterName;
    private PluginReportStatus status;
    private Long handlerId;
    private String handleNote;
    private LocalDateTime handleTime;
}
