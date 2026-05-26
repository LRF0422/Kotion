package com.knowledge.wiki.service.application;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

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

    /**
     * Validate Invitation Token
     * GET /knowledge-wiki/collaboration/invitation/:token/validate
     */
    public InvitationValidateResponseDTO validateInvitation(String token) {
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
    public InvitationAcceptResponseDTO acceptInvitation(String token) {
        log.info("Accepting invitation with token: {}", token);
        InvitationAcceptResponseDTO response = new InvitationAcceptResponseDTO();

        CollaborationInvitation invitation = collaborationInvitationService.getByToken(token);
        if (invitation == null) {
            throw WikiException.INVITATION_NOT_FOUND.newException();
        }

        if (invitation.getStatus() == InvitationStatus.ACCEPTED) {
            throw WikiException.INVITATION_ALREADY_ACCEPTED.newException();
        }

        if (invitation.getExpiresAt() != null &&
                invitation.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw WikiException.INVITATION_EXPIRED.newException();
        }

        // Accept the invitation
        spaceService.acceptInvitation(invitation.getId());

        response.setSuccess(true);
        response.setPageId(invitation.getPageId());
        response.setSpaceId(invitation.getSpaceId());
        response.setPermission(invitation.getPermission());
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
        CollaborationInvitation invitation = collaborationInvitationService.getByToken(token);

        if (invitation == null) {
            throw WikiException.INVITATION_NOT_FOUND.newException();
        }

        // Verify the invitation is accepted or user has access
        if (invitation.getStatus() != InvitationStatus.ACCEPTED) {
            // Check if current user is the invitee
            Long currentUserId = SecurityContextUtil.getUserId();
            if (!invitation.getInviteeId().equals(currentUserId)) {
                throw WikiException.FORBIDDEN_ACCESS.newException();
            }
        }

        Page page = pageService.getPageContent(invitation.getPageId());
        if (page == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }
        PageVO vo = PageConverter.INSTANCE.convertVO(page);

        // Add space info
        Space space = spaceService.getById(invitation.getSpaceId());
        if (space != null) {
            vo.setSpaceId(space.getId());
        }

        // Get and set parent pages
        List<Page> parentPages = pageService.getParents(invitation.getPageId());
        if (cn.hutool.core.collection.CollUtil.isNotEmpty(parentPages)) {
            List<PageVO> parentVOs = parentPages.stream()
                    .map(PageConverter.INSTANCE::convertVO)
                    .collect(java.util.stream.Collectors.toList());
            vo.setParents(parentVOs);
        }

        InterceptorIgnoreHelper.clearIgnoreStrategy();
        return vo;
    }

    /**
     * Get Invitation Plugins
     * GET /knowledge-wiki/collaboration/invitation/:token/plugins
     * Returns the list of installed plugins for the collaboration editor
     */
    public List<PluginVersionVO> getInvitationPlugins(String token) {
        InterceptorIgnoreHelper.handle(IgnoreStrategy.builder().tenantLine(true).build());
        CollaborationInvitation invitation = collaborationInvitationService.getByTokenForValidation(token);

        if (invitation == null) {
            throw WikiException.INVITATION_NOT_FOUND.newException();
        }

        // Verify the invitation is valid (PENDING or ACCEPTED)
        if (invitation.getStatus() != InvitationStatus.PENDING &&
                invitation.getStatus() != InvitationStatus.ACCEPTED) {
            throw WikiException.INVALID_INVITATION_STATUS.newException();
        }

        // Check if invitation has expired
        if (invitation.getExpiresAt() != null &&
                invitation.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw WikiException.INVITATION_EXPIRED.newException();
        }

        // Get installed plugins
        List<PluginVersion> installedPlugins = pluginService.getInstalledPlugins(null, invitation.getInviterId());
        List<PluginVersionVO> result = PluginVersionConverter.INSTANCE.convertVO(installedPlugins);

        InterceptorIgnoreHelper.clearIgnoreStrategy();
        return result;
    }

}
