package com.knowledge.wiki.service.application;

import java.time.LocalDateTime;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginReport;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.entity.dto.PluginReportDTO;
import com.knowledge.wiki.service.entity.dto.PluginReportHandleDTO;
import com.knowledge.wiki.service.entity.dto.QueryPluginReportDTO;
import com.knowledge.wiki.service.entity.enums.PluginReportStatus;
import com.knowledge.wiki.service.entity.vo.PluginReportVO;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.service.IPluginReportService;
import com.knowledge.wiki.service.service.IPluginService;
import com.knowledge.wiki.service.service.IPluginVersionService;

import cn.hutool.core.util.StrUtil;

/**
 * Client plugin reporting and admin handling of plugin reports.
 */
@Service
public class PluginReportApplication {

    @Autowired
    private IPluginReportService pluginReportService;
    @Autowired
    private IPluginService pluginService;
    @Autowired
    private IPluginVersionService pluginVersionService;

    @Transactional(rollbackFor = Exception.class)
    public PluginReportVO submit(PluginReportDTO dto) {
        Long userId = SecurityContextUtil.getUserId();
        if (userId == null || userId <= 0) {
            throw WikiException.PLUGIN_FORBIDDEN.newException();
        }
        Plugin plugin = pluginService.getById(dto.getPluginId());
        if (plugin == null) {
            throw WikiException.PLUGIN_NOT_FOUND.newException();
        }
        PluginReport report = new PluginReport();
        report.setPluginId(plugin.getId());
        report.setVersionId(dto.getVersionId());
        report.setReasonType(dto.getReasonType());
        report.setReasonText(StrUtil.trim(dto.getReasonText()));
        report.setReporterId(userId);
        report.setReporterName(StrUtil.trim(SecurityContextUtil.getUserName()));
        report.setStatus(PluginReportStatus.PENDING);
        pluginReportService.save(report);
        return toVO(report, plugin);
    }

    public IPage<PluginReportVO> adminList(QueryPluginReportDTO dto) {
        requirePermission("platform.plugins.read");
        IPage<PluginReport> page = pluginReportService.page(dto.page(),
                Wrappers.<PluginReport>lambdaQuery()
                        .eq(dto.getStatus() != null, PluginReport::getStatus, dto.getStatus())
                        .eq(dto.getPluginId() != null, PluginReport::getPluginId, dto.getPluginId())
                        .orderByDesc(PluginReport::getCreateTime));
        return page.convert(report -> toVO(report, null));
    }

    @Transactional(rollbackFor = Exception.class)
    public PluginReportVO handle(Long id, PluginReportHandleDTO dto) {
        requirePermission("platform.plugins.review");
        PluginReport report = pluginReportService.getById(id);
        if (report == null || report.getStatus() != PluginReportStatus.PENDING) {
            throw WikiException.INVALID_PARAMETER.newException("举报不存在或已处理");
        }
        report.setStatus(Boolean.TRUE.equals(dto.getApproved())
                ? PluginReportStatus.RESOLVED : PluginReportStatus.REJECTED);
        report.setHandlerId(SecurityContextUtil.getUserId());
        report.setHandleNote(StrUtil.trim(dto.getNote()));
        report.setHandleTime(LocalDateTime.now());
        pluginReportService.updateById(report);
        return toVO(report, null);
    }

    private PluginReportVO toVO(PluginReport report, Plugin knownPlugin) {
        PluginReportVO vo = new PluginReportVO();
        vo.setId(report.getId());
        vo.setPluginId(report.getPluginId());
        vo.setVersionId(report.getVersionId());
        vo.setReasonType(report.getReasonType());
        vo.setReasonText(report.getReasonText());
        vo.setReporterId(report.getReporterId());
        vo.setReporterName(report.getReporterName());
        vo.setStatus(report.getStatus());
        vo.setHandlerId(report.getHandlerId());
        vo.setHandleNote(report.getHandleNote());
        vo.setHandleTime(report.getHandleTime());
        vo.setCreateTime(report.getCreateTime());
        Plugin plugin = knownPlugin == null ? pluginService.getById(report.getPluginId()) : knownPlugin;
        if (plugin != null) {
            vo.setPluginName(plugin.getName());
            vo.setPluginKey(plugin.getPluginKey());
        }
        if (report.getVersionId() != null) {
            PluginVersion version = pluginVersionService.getById(report.getVersionId());
            if (version != null) {
                vo.setVersion(version.getVersion());
            }
        }
        return vo;
    }

    private void requirePermission(String permission) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        boolean allowed = authentication != null && authentication.isAuthenticated()
                && authentication.getAuthorities().stream().anyMatch(authority -> {
                    String name = authority.getAuthority();
                    return "ROLE_administrator".equalsIgnoreCase(name)
                            || "ROLE_admin".equalsIgnoreCase(name)
                            || ("ROLE_" + permission).equalsIgnoreCase(name);
                });
        if (!allowed) {
            throw WikiException.PLUGIN_FORBIDDEN.newException();
        }
    }
}
