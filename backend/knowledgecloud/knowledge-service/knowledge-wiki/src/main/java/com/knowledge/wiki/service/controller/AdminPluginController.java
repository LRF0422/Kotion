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
import com.knowledge.wiki.service.application.PluginReportApplication;
import com.knowledge.wiki.service.entity.dto.PluginBatchReviewDTO;
import com.knowledge.wiki.service.entity.dto.PluginReportHandleDTO;
import com.knowledge.wiki.service.entity.dto.PluginReviewDTO;
import com.knowledge.wiki.service.entity.dto.PluginScanReportDTO;
import com.knowledge.wiki.service.entity.dto.PluginSuspendDTO;
import com.knowledge.wiki.service.entity.dto.QueryAdminPluginDTO;
import com.knowledge.wiki.service.entity.dto.QueryPluginReportDTO;
import com.knowledge.wiki.service.entity.vo.PluginBatchReviewResultVO;
import com.knowledge.wiki.service.entity.vo.PluginReportVO;
import com.knowledge.wiki.service.entity.vo.PluginReviewStatsVO;
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
    @Autowired
    private PluginReportApplication pluginReportApplication;

    @GetMapping("/list")
    public R<IPage<PluginVO>> list(QueryAdminPluginDTO dto) {
        return R.data(pluginApplication.adminReviewList(dto));
    }

    @GetMapping("/{id}/detail")
    public R<PluginVO> detail(@PathVariable("id") Long id) {
        return R.data(pluginApplication.adminReviewDetail(id));
    }

    /** 审核时间线：该插件的全部版本（含审核状态、审核人、审核意见、驳回分类）。 */
    @GetMapping("/{id}/versions")
    public R<List<PluginVersionVO>> versions(@PathVariable("id") Long id) {
        return R.data(pluginApplication.adminReviewVersions(id));
    }

    /** 审核运营指标：队列规模、通过率、平均时效、驳回原因分布。 */
    @GetMapping("/stats/review")
    public R<PluginReviewStatsVO> reviewStats() {
        return R.data(pluginApplication.reviewStats());
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

    /** 批量审核，逐条独立事务，返回成功数与失败明细。 */
    @PostMapping("/batch-review")
    @PreAuthorize("(hasRole('platform.plugins.review') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    public R<PluginBatchReviewResultVO> batchReview(@Valid @RequestBody PluginBatchReviewDTO dto) {
        return R.data(pluginApplication.batchReview(dto));
    }

    /** 认领当前候选版本，避免多个审核员重复审核。 */
    @PostMapping("/{id}/claim")
    @PreAuthorize("(hasRole('platform.plugins.review') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    public R<PluginVO> claim(@PathVariable("id") Long id) {
        return R.data(pluginApplication.claim(id));
    }

    /** 释放当前候选版本的认领。 */
    @PostMapping("/{id}/release")
    @PreAuthorize("(hasRole('platform.plugins.review') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    public R<PluginVO> release(@PathVariable("id") Long id) {
        return R.data(pluginApplication.release(id));
    }

    /** 持久化启发式安全扫描结果。 */
    @PostMapping("/{id}/scan-report")
    @PreAuthorize("(hasRole('platform.plugins.review') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    public R<PluginVersionVO> scanReport(@PathVariable("id") Long id,
            @Valid @RequestBody PluginScanReportDTO dto) {
        return R.data(pluginApplication.saveScanReport(id, dto));
    }

    /** 下架 / 紧急召回已上架插件。 */
    @PostMapping("/{id}/suspend")
    @PreAuthorize("(hasRole('platform.plugins.review') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    public R<PluginVO> suspend(@PathVariable("id") Long id, @Valid @RequestBody PluginSuspendDTO dto) {
        return R.data(pluginApplication.suspend(id, dto));
    }

    /** 恢复已下架插件。 */
    @PostMapping("/{id}/restore")
    @PreAuthorize("(hasRole('platform.plugins.review') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    public R<PluginVO> restore(@PathVariable("id") Long id) {
        return R.data(pluginApplication.restore(id));
    }

    /** 插件举报列表。 */
    @GetMapping("/report/list")
    public R<IPage<PluginReportVO>> reportList(QueryPluginReportDTO dto) {
        return R.data(pluginReportApplication.adminList(dto));
    }

    /** 处理插件举报（采纳/驳回）。 */
    @PostMapping("/report/{reportId}/handle")
    @PreAuthorize("(hasRole('platform.plugins.review') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    public R<PluginReportVO> handleReport(@PathVariable("reportId") Long reportId,
            @Valid @RequestBody PluginReportHandleDTO dto) {
        return R.data(pluginReportApplication.handle(reportId, dto));
    }
}
