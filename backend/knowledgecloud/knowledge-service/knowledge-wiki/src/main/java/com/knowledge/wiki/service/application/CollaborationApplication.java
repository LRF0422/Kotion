package com.knowledge.wiki.service.application;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.plugins.IgnoreStrategy;
import com.baomidou.mybatisplus.core.plugins.InterceptorIgnoreHelper;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.utils.ApiClientUtil;
import com.knowledge.system.feign.IUserClient;
import com.knowledge.wiki.service.converter.PageConverter;
import com.knowledge.wiki.service.converter.PluginVersionConverter;
import com.knowledge.wiki.service.entity.CollaborationInvitation;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.dto.InvitationAcceptResponseDTO;
import com.knowledge.wiki.service.entity.dto.InvitationValidateResponseDTO;
import com.knowledge.wiki.service.entity.enums.InvitationStatus;
import com.knowledge.wiki.service.entity.vo.PageVO;
import com.knowledge.wiki.service.entity.vo.PluginVersionVO;
import com.knowledge.wiki.service.service.ICollaborationInvitationService;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.IPluginService;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.service.IPermissionService;
import com.knowledge.wiki.service.service.ISpaceService;
import lombok.extern.slf4j.Slf4j;

/**
 * Collaboration Application
 * Handles invitation acceptance flow
 */
@Service
@Slf4j
public class CollaborationApplication {

    @Autowired
    private ICollaborationInvitationService collaborationInvitationService;
    @Autowired
    private ISpaceService spaceService;
    @Autowired
    private IPageService pageService;
    @Autowired
    private IUserClient userClient;
    @Autowired
    private IPluginService pluginService;
    @Autowired
    private IPermissionService permissionService;

    /**
     * Validate Invitation Token
     * GET /knowledge-wiki/collaboration/invitation/:token/validate
     */
    public InvitationValidateResponseDTO validateInvitation(String token) {
        InterceptorIgnoreHelper.handle(IgnoreStrategy.builder().tenantLine(true).build());
        try {
            return validateInvitationInternal(token);
        } finally {
            InterceptorIgnoreHelper.clearIgnoreStrategy();
        }
    }

    private InvitationValidateResponseDTO validateInvitationInternal(String token) {
        // Use getByTokenForValidation to get invitation regardless of status
        CollaborationInvitation invitation = collaborationInvitationService.getByTokenForValidation(token);

        InvitationValidateResponseDTO response = new InvitationValidateResponseDTO();

        if (invitation == null) {
            response.setStatus("NOT_FOUND");
            return response;
        }

        response.setId(invitation.getId());
        response.setPageId(invitation.getPageId());
        response.setSpaceId(invitation.getSpaceId());
        response.setPermission(invitation.getPermission());
        response.setExpiresAt(invitation.getExpiresAt());
        response.setInviterId(invitation.getInviterId());

        // Get page info
        Page page = pageService.getById(invitation.getPageId());
        if (page != null) {
            response.setPageTitle(page.getTitle());
            response.setPageType(page.getPageType());
        }

        // Get space info
        Space space = spaceService.getById(invitation.getSpaceId());
        if (space != null) {
            response.setSpaceName(space.getName());
        }

        // Get inviter info
        KnowledgeUser inviter = ApiClientUtil.resolvingResponse(
                userClient.getUserById(invitation.getInviterId()));
        if (inviter != null) {
            response.setInviterName(inviter.getUserName());
        }

        // Determine status
        if (invitation.getStatus() == InvitationStatus.ACCEPTED) {
            response.setStatus("ACCEPTED");
        } else if (invitation.getStatus() == InvitationStatus.REJECTED) {
            response.setStatus("REVOKED");
        } else if (invitation.getStatus() == InvitationStatus.EXPIRED) {
            response.setStatus("EXPIRED");
        } else if (invitation.getExpiresAt() != null &&
                invitation.getExpiresAt().isBefore(LocalDateTime.now())) {
            response.setStatus("EXPIRED");
        } else {
            response.setStatus("PENDING");
        }

        return response;
    }

    /**
     * Accept Invitation
     * POST /knowledge-wiki/collaboration/invitation/:token/accept
     */
    @Transactional(rollbackFor = Exception.class)
    public InvitationAcceptResponseDTO acceptInvitation(String token) {
        InterceptorIgnoreHelper.handle(IgnoreStrategy.builder().tenantLine(true).build());
        try {
            return acceptInvitationInternal(token);
        } finally {
            InterceptorIgnoreHelper.clearIgnoreStrategy();
        }
    }

    private InvitationAcceptResponseDTO acceptInvitationInternal(String token) {
        InvitationAcceptResponseDTO response = new InvitationAcceptResponseDTO();

        CollaborationInvitation invitation = collaborationInvitationService.getByToken(token);
        if (invitation == null) {
            throw WikiException.INVITATION_NOT_FOUND.newException();
        }
        requireCurrentInvitee(invitation);

        if (invitation.getStatus() == InvitationStatus.ACCEPTED) {
            throw WikiException.INVITATION_ALREADY_ACCEPTED.newException();
        }
        if (invitation.getStatus() != InvitationStatus.PENDING) {
            throw WikiException.INVALID_INVITATION_STATUS.newException();
        }

        if (isExpired(invitation)) {
            throw WikiException.INVITATION_EXPIRED.newException();
        }
        Page page = pageService.getById(invitation.getPageId());
        if (page == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }
        requireMatchingSpace(invitation, page);

        // Accept the invitation and materialize its page grant/guest membership.
        spaceService.acceptInvitation(invitation.getId());

        response.setSuccess(true);
        response.setPageId(invitation.getPageId());
        response.setSpaceId(invitation.getSpaceId());
        response.setPageType(page.getPageType());
        response.setPermission(permissionService.effectivePagePermission(SecurityContextUtil.getUserId(), page));
        response.setAcceptedAt(LocalDateTime.now());
        log.info("Invitation accepted successfully for pageId: {}", invitation.getPageId());

        return response;
    }

    /**
     * Get Invitation Page Content
     * GET /knowledge-wiki/collaboration/invitation/:token/page
     */
    public PageVO getInvitationPage(String token) {
        InterceptorIgnoreHelper.handle(IgnoreStrategy.builder().tenantLine(true).build());
        try {
            CollaborationInvitation invitation = collaborationInvitationService.getByToken(token);
            if (invitation == null) {
                throw WikiException.INVITATION_NOT_FOUND.newException();
            }
            requireCurrentInvitee(invitation);
            if (invitation.getStatus() != InvitationStatus.ACCEPTED) {
                throw WikiException.INVALID_INVITATION_STATUS.newException();
            }
            if (isExpired(invitation)) {
                throw WikiException.INVITATION_EXPIRED.newException();
            }

            Page pageRecord = pageService.getById(invitation.getPageId());
            if (pageRecord == null) {
                throw WikiException.PAGE_NOT_FOUND.newException();
            }
            requireMatchingSpace(invitation, pageRecord);
            permissionService.checkPagePermission(SecurityContextUtil.getUserId(), pageRecord,
                    IPermissionService.PERMISSION_READ);

            Page page = pageService.getPageContent(invitation.getPageId());
            if (page == null) {
                throw WikiException.PAGE_NOT_FOUND.newException();
            }
            PageVO vo = PageConverter.INSTANCE.convertVO(page);
            vo.setPermission(permissionService.effectivePagePermission(SecurityContextUtil.getUserId(), pageRecord));

            Space space = spaceService.getById(pageRecord.getSpaceId());
            if (space != null) {
                vo.setSpaceId(space.getId());
            }

            List<Page> parentPages = pageService.getParents(invitation.getPageId());
            if (cn.hutool.core.collection.CollUtil.isNotEmpty(parentPages)) {
                List<PageVO> parentVOs = parentPages.stream()
                        .map(PageConverter.INSTANCE::convertVO)
                        .collect(java.util.stream.Collectors.toList());
                vo.setParents(parentVOs);
            }
            return vo;
        } finally {
            InterceptorIgnoreHelper.clearIgnoreStrategy();
        }
    }

    /**
     * Get Invitation Plugins
     * GET /knowledge-wiki/collaboration/invitation/:token/plugins
     * Returns the list of installed plugins for the collaboration editor
     */
    public List<PluginVersionVO> getInvitationPlugins(String token) {
        InterceptorIgnoreHelper.handle(IgnoreStrategy.builder().tenantLine(true).build());
        try {
            CollaborationInvitation invitation = collaborationInvitationService.getByTokenForValidation(token);
            if (invitation == null) {
                throw WikiException.INVITATION_NOT_FOUND.newException();
            }
            requireCurrentInvitee(invitation);

            if (invitation.getStatus() != InvitationStatus.PENDING &&
                    invitation.getStatus() != InvitationStatus.ACCEPTED) {
                throw WikiException.INVALID_INVITATION_STATUS.newException();
            }
            if (isExpired(invitation)) {
                throw WikiException.INVITATION_EXPIRED.newException();
            }

            List<PluginVersion> installedPlugins = pluginService.getInstalledPlugins(null, invitation.getInviterId());
            return PluginVersionConverter.INSTANCE.convertVO(installedPlugins);
        } finally {
            InterceptorIgnoreHelper.clearIgnoreStrategy();
        }
    }

    private void requireCurrentInvitee(CollaborationInvitation invitation) {
        if (invitation.getInviteeId() == null
                || !Objects.equals(invitation.getInviteeId(), SecurityContextUtil.getUserId())) {
            throw WikiException.FORBIDDEN_ACCESS.newException();
        }
    }

    private boolean isExpired(CollaborationInvitation invitation) {
        return invitation.getStatus() == InvitationStatus.EXPIRED
                || (invitation.getExpiresAt() != null
                        && invitation.getExpiresAt().isBefore(LocalDateTime.now()));
    }

    private void requireMatchingSpace(CollaborationInvitation invitation, Page page) {
        if (invitation.getSpaceId() != null
                && !Objects.equals(invitation.getSpaceId(), page.getSpaceId())) {
            throw WikiException.FORBIDDEN_ACCESS.newException();
        }
    }

}
