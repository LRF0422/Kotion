package com.knowledge.wiki.service.controller;

import java.util.List;

import javax.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.wiki.service.application.PluginApplication;
import com.knowledge.wiki.service.entity.dto.PluginReviewDTO;
import com.knowledge.wiki.service.entity.dto.QueryAdminPluginDTO;
import com.knowledge.wiki.service.entity.vo.PluginVO;
import com.knowledge.wiki.service.entity.vo.PluginVersionVO;

/**
 * 插件后台审核接口。
 */
@RestController
@RequestMapping("/admin/plugin")
@PreAuthorize("(hasRole('platform.plugins.read') or " + RoleConstant.HAS_ROLE_ADMIN
        + ") and principal.clientId == 'kotion-platform-admin'")
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

    /** 审核时间线：该插件的全部版本（含审核状态、审核人、审核意见）。 */
    @GetMapping("/{id}/versions")
    public R<List<PluginVersionVO>> versions(@PathVariable("id") Long id) {
        return R.data(pluginApplication.adminReviewVersions(id));
    }

    /**
     * 审核决定（START/APPROVE/REJECT）。方法级鉴权覆盖类级的读权限，
     * 使仅有 platform.plugins.review 的审核员也能执行审核。
     */
    @PostMapping("/{id}/review")
    @PreAuthorize("(hasRole('platform.plugins.review') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    public R<PluginVO> review(@PathVariable("id") Long id, @Valid @RequestBody PluginReviewDTO dto) {
        return R.data(pluginApplication.review(id, dto));
    }
}
