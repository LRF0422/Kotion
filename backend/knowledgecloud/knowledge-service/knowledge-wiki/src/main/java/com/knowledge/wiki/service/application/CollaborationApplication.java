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
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.utils.ApiClientUtil;
import com.knowledge.system.feign.IUserClient;
import com.knowledge.wiki.feign.IOrganizationMembershipClient;
import com.knowledge.wiki.service.converter.PageConverter;
import com.knowledge.wiki.service.converter.PluginVersionConverter;
import com.knowledge.wiki.service.entity.CollaborationInvitation;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.dto.InvitationAcceptResponseDTO;
import com.knowledge.wiki.service.entity.dto.InvitationEnterResponseDTO;
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
    private IOrganizationMembershipClient organizationMembershipClient;
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

        // The invitee may live in a different context than the shared space. Try to
        // grant that context's membership so the client can switch into it and open
        // the page; failure is non-fatal (see ensureSpaceContextMembership).
        SpaceContext context = ensureSpaceContextMembership(invitation, page);

        response.setSuccess(true);
        response.setPageId(invitation.getPageId());
        response.setSpaceId(invitation.getSpaceId());
        response.setContextId(context.contextId);
        response.setPageType(page.getPageType());
        response.setPermission(permissionService.effectivePagePermission(SecurityContextUtil.getUserId(), page));
        response.setAcceptedAt(LocalDateTime.now());
        log.info("Invitation accepted successfully for pageId: {}", invitation.getPageId());

        return response;
    }

    /**
     * Resolve the data the client needs to open an accepted invitation through the
     * normal page route.
     *
     * <p>The invitation endpoints run with the tenant line ignored, so they can see a
     * space that lives in the inviter's context. The regular space/page reads cannot:
     * a session in another context resolves {@code wiki_space} to nothing and the user
     * sees "空间不存在". This endpoint therefore reports the space/page ids plus the
     * context the client must switch into before navigating, and makes a best-effort
     * attempt to grant the invitee that context's membership first. It is idempotent,
     * so it also repairs invitations accepted before the membership grant existed.
     *
     * POST /knowledge-wiki/collaboration/invitation/:token/enter
     */
    public InvitationEnterResponseDTO enterInvitation(String token) {
        InterceptorIgnoreHelper.handle(IgnoreStrategy.builder().tenantLine(true).build());
        try {
            CollaborationInvitation invitation = collaborationInvitationService.getByTokenForValidation(token);
            if (invitation == null) {
                throw WikiException.INVITATION_NOT_FOUND.newException();
            }
            requireCurrentInvitee(invitation);
            if (invitation.getStatus() != InvitationStatus.ACCEPTED) {
                throw WikiException.INVALID_INVITATION_STATUS.newException();
            }

            Page page = pageService.getById(invitation.getPageId());
            if (page == null) {
                throw WikiException.PAGE_NOT_FOUND.newException();
            }
            requireMatchingSpace(invitation, page);

            InvitationEnterResponseDTO response = new InvitationEnterResponseDTO();
            Long spaceId = invitation.getSpaceId() != null ? invitation.getSpaceId() : page.getSpaceId();
            response.setSpaceId(spaceId);
            response.setPageId(page.getId());
            response.setPageType(page.getPageType());
            SpaceContext context = ensureSpaceContextMembership(invitation, page);
            response.setContextId(context.contextId);
            response.setContextSwitchAllowed(context.switchAllowed);
            response.setContextMessage(context.message);
            response.setPermission(permissionService.effectivePagePermission(SecurityContextUtil.getUserId(), page));
            return response;
        } finally {
            InterceptorIgnoreHelper.clearIgnoreStrategy();
        }
    }

    /**
     * Outcome of trying to admit the invitee into the context that owns the shared
     * space: the context id (null when the space predates context binding), whether
     * the client may switch into it, and the server reason when it may not.
     */
    private static final class SpaceContext {
        private final String contextId;
        private final boolean switchAllowed;
        private final String message;

        private SpaceContext(String contextId, boolean switchAllowed, String message) {
            this.contextId = contextId;
            this.switchAllowed = switchAllowed;
            this.message = message;
        }
    }

    /**
     * Try to admit the invitee into the context that owns the shared space.
     *
     * <p>The regular read paths are context-scoped, so a session in another context
     * resolves {@code wiki_space} to nothing and the user sees "空间不存在". A successful
     * grant lets the client switch into the space's context and use the normal page
     * route. When the grant is impossible — most importantly a space created in the
     * owner's personal (INDIVIDUAL) context, where admitting a guest would expose the
     * whole personal wiki — {@code switchAllowed} is false and the client falls back
     * to invitation-token-scoped editing.
     *
     * <p>Skipped when the caller is already in the space's context, where the normal
     * route resolves on its own.
     */
    private SpaceContext ensureSpaceContextMembership(CollaborationInvitation invitation, Page page) {
        Long spaceId = invitation.getSpaceId() != null ? invitation.getSpaceId() : page.getSpaceId();
        Space space = spaceId == null ? null : spaceService.getById(spaceId);
        String contextId = space == null ? null : space.getTenantId();
        if (contextId == null || contextId.trim().isEmpty() || invitation.getInviteeId() == null) {
            return new SpaceContext(contextId, false, null);
        }
        // Already operating in the owning context: every read will resolve normally,
        // and the invitee's space membership/page grant already carries the access.
        String currentContextId = SecurityContextUtil.getTenantId();
        if (contextId.equals(currentContextId)) {
            return new SpaceContext(contextId, true, null);
        }
        // Two attempts: the first call to a freshly created Feign context can fail while
        // the load balancer warms up (observed as a ~5s timeout surfacing through the
        // sentinel fallback as an R with no message); the retry then succeeds.
        for (int attempt = 1; attempt <= 2; attempt++) {
            try {
                R<Boolean> result = organizationMembershipClient.ensureMember(invitation.getInviteeId(), contextId);
                if (result != null && result.getCode() == 200 && Boolean.TRUE.equals(result.getData())) {
                    return new SpaceContext(contextId, true, null);
                }
                log.warn("Could not grant context membership. attempt={}, inviteeId={}, contextId={}, code={}, msg={}",
                        attempt, invitation.getInviteeId(), contextId,
                        result == null ? null : result.getCode(),
                        result == null ? null : result.getMsg());
                // A well-formed non-200 answer is a business rejection (personal context,
                // suspended member, ...) — retrying cannot change it. Report it so the
                // client can fall back to token-scoped editing with an accurate reason.
                return new SpaceContext(contextId, false, result == null ? null : result.getMsg());
            } catch (RuntimeException remoteFailure) {
                // Transport/sentinel failures are retried once; if the retry also fails
                // the client falls back to token-scoped editing rather than a dead end.
                log.warn("Context membership grant call failed. attempt={}, inviteeId={}, contextId={}",
                        attempt, invitation.getInviteeId(), contextId, remoteFailure);
            }
        }
        return new SpaceContext(contextId, false, null);
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
