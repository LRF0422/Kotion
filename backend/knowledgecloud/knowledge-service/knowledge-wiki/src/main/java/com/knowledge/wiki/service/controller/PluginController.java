package com.knowledge.wiki.service.controller;

import javax.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.application.PluginApplication;
import com.knowledge.wiki.service.entity.dto.PluginDTO;
import com.knowledge.wiki.service.entity.dto.PluginReviewDTO;
import com.knowledge.wiki.service.entity.dto.PluginSubmissionDTO;
import com.knowledge.wiki.service.entity.dto.PluginVersionPublishDTO;
import com.knowledge.wiki.service.entity.dto.QueryPluginDTO;
import com.knowledge.wiki.service.entity.vo.PluginVO;

@RestController
@RequestMapping("/plugin")
public class PluginController {

    @Autowired
    private PluginApplication pluginApplication;

    @PostMapping
    public R<?> create(@Valid @RequestBody PluginDTO dto) {
        pluginApplication.createPlugin(dto);
        return R.success();
    }

    @PostMapping("/public/inner")
    public R<?> createInner(@Validated @Valid @RequestBody PluginDTO dto) {
        pluginApplication.createInnerPlugin(dto);
        return R.success();
    }

    @PostMapping("/submissions")
    public R<PluginVO> submit(@Valid @RequestBody PluginSubmissionDTO dto) {
        return R.data(pluginApplication.submit(dto));
    }

    @PutMapping("/submissions/{id}")
    public R<PluginVO> resubmit(@PathVariable("id") Long id,
            @Valid @RequestBody PluginSubmissionDTO dto) {
        return R.data(pluginApplication.resubmit(id, dto));
    }

    @GetMapping("/submissions/mine")
    public R<IPage<PluginVO>> mySubmissions(QueryPluginDTO dto) {
        return R.data(pluginApplication.mySubmissions(dto));
    }

    @PostMapping("/submissions/{id}/review")
    public R<PluginVO> review(@PathVariable("id") Long id, @Valid @RequestBody PluginReviewDTO dto) {
        return R.data(pluginApplication.review(id, dto));
    }

    @PostMapping("/{id}/versions")
    public R<PluginVO> publishVersion(@PathVariable("id") Long id,
            @Valid @RequestBody PluginVersionPublishDTO dto) {
        return R.data(pluginApplication.publishVersion(id, dto));
    }

    @GetMapping({ "/public", "" })
    public R<IPage<PluginVO>> plugin(QueryPluginDTO dto) {
        return R.data(pluginApplication.searchPlugin(dto));
    }

    @GetMapping("/public/plugins")
    public R<IPage<PluginVO>> publicPlugin(QueryPluginDTO dto) {
        return R.data(pluginApplication.searchPlugin(dto));
    }

    @GetMapping("/{id}")
    public R<PluginVO> detail(@PathVariable("id") Long id) {
        return R.data(pluginApplication.detail(id));
    }

    @PostMapping("/install")
    public R<?> install(@RequestParam("versionId") Long versionId) {
        pluginApplication.installPlugin(versionId);
        return R.success();
    }

    @GetMapping("/install/list")
    public R<?> installedList() {
        return R.data(pluginApplication.getInstalledPlugins());
    }

    @PostMapping("/uninstall")
    public R<?> uninstall(@RequestParam("versionId") Long versionId) {
        pluginApplication.uninstall(versionId);
        return R.success();
    }

    @PostMapping("/update")
    public R<?> update(@RequestParam("versionId") Long versionId) {
        pluginApplication.updatePluginToLatestVersion(versionId);
        return R.success();
    }

    @PostMapping("/enable")
    public R<?> enable(@RequestParam("versionId") Long versionId) {
        pluginApplication.enable(versionId);
        return R.success();
    }

    @PostMapping("/disable")
    public R<?> disable(@RequestParam("versionId") Long versionId) {
        pluginApplication.disable(versionId);
        return R.success();
    }

    @PostMapping("/remove")
    public R<?> remove(@RequestParam("versionId") Long versionId) {
        pluginApplication.deleteInstalled(versionId);
        return R.success();
    }

}
