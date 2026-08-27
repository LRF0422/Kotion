package com.knowledge.wiki.service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.application.PluginApplication;
import com.knowledge.wiki.service.entity.dto.QueryAdminPluginDTO;
import com.knowledge.wiki.service.entity.vo.PluginVO;

/**
 * 插件后台审核接口。
 */
@RestController
@RequestMapping("/admin/plugin")
public class AdminPluginController {

    @Autowired
    private PluginApplication pluginApplication;

    @GetMapping("/list")
    public R<IPage<PluginVO>> list(QueryAdminPluginDTO dto) {
        return R.data(pluginApplication.adminReviewList(dto));
    }

    @GetMapping("/{id}/detail")
    public R<PluginVO> detail(@PathVariable("id") Long id) {
        return R.data(pluginApplication.adminReviewDetail(id));
    }
}
