package com.knowledge.wiki.service.service.impl;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.PluginReport;
import com.knowledge.wiki.service.mapper.PluginReportMapper;
import com.knowledge.wiki.service.service.IPluginReportService;

@Service
public class PluginReportServiceImpl extends MPJBaseServiceImpl<PluginReportMapper, PluginReport>
        implements IPluginReportService {
}
