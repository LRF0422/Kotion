package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;

import com.knowledge.wiki.service.entity.enums.PluginReportReason;

import lombok.Data;

@Data
public class PluginReportDTO implements Serializable {

    @NotNull(message = "插件不能为空")
    private Long pluginId;

    private Long versionId;

    @NotNull(message = "举报原因不能为空")
    private PluginReportReason reasonType;

    @Size(max = 500, message = "补充说明不能超过500")
    private String reasonText;
}
