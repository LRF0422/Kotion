package com.knowledge.system.controller;

import java.util.List;

import javax.validation.Valid;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.application.OrganizationApplication;
import com.knowledge.system.domain.dto.OrganizationCreateDTO;
import com.knowledge.system.domain.dto.OrganizationInviteDTO;
import com.knowledge.system.domain.dto.OrganizationMemberRoleDTO;
import com.knowledge.system.domain.vo.ContextVO;
import com.knowledge.system.domain.vo.OrganizationInvitationVO;
import com.knowledge.system.domain.vo.OrganizationMemberVO;

import lombok.AllArgsConstructor;

@RestController
@AllArgsConstructor
@RequestMapping("/api/v1")
public class OrganizationController {

    private final OrganizationApplication organizationApplication;

    @GetMapping("/me/contexts")
    public R<List<ContextVO>> contexts() {
        return R.data(organizationApplication.listContexts(currentUserId()));
    }

    @GetMapping("/organizations")
    public R<List<ContextVO>> organizations() {
        return contexts();
    }

    @PostMapping("/organizations")
    public R<ContextVO> create(@Valid @RequestBody OrganizationCreateDTO dto) {
        return R.data(organizationApplication.createOrganization(currentUserId(), dto));
    }

    @GetMapping("/organizations/{contextId}/members")
    public R<List<OrganizationMemberVO>> members(@PathVariable String contextId) {
        requireCurrentContext(contextId);
        return R.data(organizationApplication.listMembers(currentUserId(), contextId));
    }

    @PostMapping("/organizations/{contextId}/invitations")
    public R<OrganizationInvitationVO> invite(
            @PathVariable String contextId,
            @Valid @RequestBody OrganizationInviteDTO dto) {
        requireCurrentContext(contextId);
        return R.data(organizationApplication.invite(currentUserId(), contextId, dto));
    }

    @PostMapping("/organization-invitations/{token}/accept")
    public R<ContextVO> accept(@PathVariable String token) {
        return R.data(organizationApplication.acceptInvitation(currentUserId(), token));
    }

    @PatchMapping("/organizations/{contextId}/members/{memberId}")
    public R<?> updateMemberRole(
            @PathVariable String contextId,
            @PathVariable Long memberId,
            @Valid @RequestBody OrganizationMemberRoleDTO dto) {
        requireCurrentContext(contextId);
        organizationApplication.updateMemberRole(currentUserId(), contextId, memberId, dto.getRole());
        return R.success();
    }

    @DeleteMapping("/organizations/{contextId}/members/{memberId}")
    public R<?> removeMember(@PathVariable String contextId, @PathVariable Long memberId) {
        requireCurrentContext(contextId);
        organizationApplication.removeMember(currentUserId(), contextId, memberId);
        return R.success();
    }

    @PostMapping("/organizations/{contextId}/leave")
    public R<?> leave(@PathVariable String contextId) {
        requireCurrentContext(contextId);
        organizationApplication.leave(currentUserId(), contextId);
        return R.success();
    }

    private Long currentUserId() {
        Long userId = SecurityContextUtil.getUserId();
        if (userId == null || userId <= 0) {
            throw new ServiceException("用户未登录");
        }
        return userId;
    }

    private void requireCurrentContext(String contextId) {
        String currentContextId = SecurityContextUtil.getTenantId();
        if (currentContextId == null || currentContextId.isEmpty()) {
            throw new ServiceException("当前上下文无效");
        }
        if (!currentContextId.equals(contextId)) {
            throw new ServiceException("请求组织与当前上下文不一致");
        }
    }
}
