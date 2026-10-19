package com.knowledge.system.controller;

import javax.validation.Valid;

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
import com.knowledge.system.application.DeveloperApplication;
import com.knowledge.system.domain.dto.DeveloperReviewDTO;
import com.knowledge.system.domain.dto.QueryDeveloperDTO;
import com.knowledge.system.domain.vo.AdminDeveloperVO;

import lombok.AllArgsConstructor;

/**
 * 开发者认证后台审核接口。
 *
 * <p>读权限复用插件审核的 {@code platform.plugins.read}，审核动作复用
 * {@code platform.plugins.review}：现有插件审核员无需额外授权即可审核开发者认证。
 */
@RestController
@RequestMapping("/admin/developer")
@PreAuthorize("(hasRole('platform.plugins.read') or " + RoleConstant.HAS_ROLE_ADMIN
        + ") and principal.clientId == 'kotion-platform-admin'")
@AllArgsConstructor
public class AdminDeveloperController {

    private final DeveloperApplication developerApplication;

    @GetMapping("/list")
    public R<IPage<AdminDeveloperVO>> list(QueryDeveloperDTO dto) {
        return R.data(developerApplication.adminList(dto));
    }

    /** 通过认证（PENDING → APPROVED）。 */
    @PostMapping("/{id}/approve")
    @PreAuthorize("(hasRole('platform.plugins.review') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    public R<AdminDeveloperVO> approve(@PathVariable("id") Long id,
            @Valid @RequestBody DeveloperReviewDTO dto) {
        return R.data(developerApplication.approve(id, dto));
    }

    /** 驳回认证（PENDING → REJECTED），reason 必填。 */
    @PostMapping("/{id}/reject")
    @PreAuthorize("(hasRole('platform.plugins.review') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    public R<AdminDeveloperVO> reject(@PathVariable("id") Long id,
            @Valid @RequestBody DeveloperReviewDTO dto) {
        return R.data(developerApplication.reject(id, dto));
    }

    /** 撤销已通过的认证（APPROVED → SUSPENDED），reason 必填。 */
    @PostMapping("/{id}/revoke")
    @PreAuthorize("(hasRole('platform.plugins.review') or " + RoleConstant.HAS_ROLE_ADMIN
            + ") and principal.clientId == 'kotion-platform-admin'")
    public R<AdminDeveloperVO> revoke(@PathVariable("id") Long id,
            @Valid @RequestBody DeveloperReviewDTO dto) {
        return R.data(developerApplication.revoke(id, dto));
    }
}
