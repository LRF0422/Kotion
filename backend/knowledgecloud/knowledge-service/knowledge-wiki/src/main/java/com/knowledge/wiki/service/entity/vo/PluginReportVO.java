package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.knowledge.wiki.service.entity.enums.PluginReportReason;
import com.knowledge.wiki.service.entity.enums.PluginReportStatus;

import lombok.Data;

@Data
public class PluginReportVO implements Serializable {

    private Long id;
    private Long pluginId;
    private String pluginName;
    private String pluginKey;
    private Long versionId;
    private String version;
    private PluginReportReason reasonType;
    private String reasonText;
    private Long reporterId;
    private String reporterName;
    private PluginReportStatus status;
    private Long handlerId;
    private String handlerName;
    private String handleNote;
    private LocalDateTime handleTime;
    private LocalDateTime createTime;
}
