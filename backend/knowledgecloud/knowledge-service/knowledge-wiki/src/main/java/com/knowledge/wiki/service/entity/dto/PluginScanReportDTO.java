package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.Size;

import lombok.Data;

/**
 * Heuristic safety-scan result produced by the admin console and persisted for audit.
 */
@Data
public class PluginScanReportDTO implements Serializable {

    @Size(max = 16, message = "扫描状态不合法")
    private String status;

    @Size(max = 20000, message = "扫描报告过大")
    private String report;
}
