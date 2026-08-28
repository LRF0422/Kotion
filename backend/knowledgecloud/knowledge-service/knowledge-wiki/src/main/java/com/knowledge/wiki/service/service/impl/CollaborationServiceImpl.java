package com.knowledge.wiki.service.service.impl;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.knowledge.core.message.core.IEventBus;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.entity.CollaborationInvitation;
import com.knowledge.wiki.service.entity.Collaborator;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageCollaborator;
import com.knowledge.wiki.service.entity.enums.CollaboratorRole;
import com.knowledge.wiki.service.entity.enums.InvitationStatus;
import com.knowledge.wiki.service.entity.event.InvitationAcceptEvent;
import com.knowledge.wiki.service.service.ICollaborationInvitationService;
import com.knowledge.wiki.service.service.ICollaborationService;
import com.knowledge.wiki.service.service.IPageCollaboratorService;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.ISpaceMemberService;

import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class CollaborationServiceImpl implements ICollaborationService {

    @Autowired
    private ICollaborationInvitationService collaborationInvitationService;
    @Autowired
    private IPageCollaboratorService pageCollaboratorService;
    @Autowired
    private IPageService pageService;
    @Autowired
    private ISpaceMemberService spaceMemberService;
    @Autowired
    private IEventBus eventBus;

    @Override
    public List<CollaborationInvitation> createCollaborationInvitation(List<CollaborationInvitation> invitations) {
        return collaborationInvitationService.create(invitations);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Collaborator accept(Long id) {
        CollaborationInvitation invitation = collaborationInvitationService.getById(id);
        validateInvitationTarget(invitation);
        collaborationInvitationService.accept(id);
        return createCollaboratorFromInvitation(invitation, id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Collaborator acceptByToken(String token) {
        CollaborationInvitation invitation = collaborationInvitationService.getByToken(token);
        validateInvitationTarget(invitation);
        collaborationInvitationService.accept(invitation.getId());
        return createCollaboratorFromInvitation(invitation, invitation.getId());
    }

    private Collaborator createCollaboratorFromInvitation(CollaborationInvitation invitation, Long invitationId) {
        // Preserve the legacy return contract without writing the unused
        // wiki_collaborator table. Runtime authorization is materialized below.
        Collaborator collaborator = new Collaborator();
        collaborator.setUserId(invitation.getInviteeId());

        // Create PageCollaborator record if pageId is present
        if (invitation.getPageId() != null) {
            PageCollaborator pageCollaborator = pageCollaboratorService.lambdaQuery()
                    .eq(PageCollaborator::getPageId, invitation.getPageId())
                    .eq(PageCollaborator::getUserId, invitation.getInviteeId())
                    .one();

            if (pageCollaborator == null) {
                pageCollaborator = new PageCollaborator();
                pageCollaborator.setPageId(invitation.getPageId());
                pageCollaborator.setUserId(invitation.getInviteeId());
                pageCollaborator.setPermission(invitation.getPermission());
                pageCollaborator.setInvitedBy(invitation.getInviterId());
                pageCollaborator.setCreatedAt(LocalDateTime.now());
                pageCollaborator.setUpdatedAt(LocalDateTime.now());
                pageCollaboratorService.save(pageCollaborator);
            } else if (permissionRank(invitation.getPermission()) > permissionRank(pageCollaborator.getPermission())) {
                pageCollaborator.setPermission(invitation.getPermission());
                pageCollaborator.setInvitedBy(invitation.getInviterId());
                pageCollaborator.setUpdatedAt(LocalDateTime.now());
                pageCollaboratorService.updateById(pageCollaborator);
            }
        }

        // Invitee becomes a persistent space member (GUEST) so the page stays
        // accessible through the normal routes after the inviter goes offline
        ensureSpaceMembership(invitation);

        // Dispatch event
        InvitationAcceptEvent event = new InvitationAcceptEvent(this);
        event.setId(invitationId);
        eventBus.dispatch(event);
        return collaborator;
    }

    private void validateInvitationTarget(CollaborationInvitation invitation) {
        if (invitation == null) {
            throw WikiException.INVITATION_NOT_FOUND.newException();
        }
        if (invitation.getPageId() == null || invitation.getInviteeId() == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        if (invitation.getStatus() != InvitationStatus.PENDING) {
            throw WikiException.INVALID_INVITATION_STATUS.newException();
        }
        if (invitation.getExpiresAt() != null
                && invitation.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw WikiException.INVITATION_EXPIRED.newException();
        }
        Page page = pageService.getById(invitation.getPageId());
        if (page == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }
        if (invitation.getSpaceId() != null
                && !invitation.getSpaceId().equals(page.getSpaceId())) {
            throw WikiException.FORBIDDEN_ACCESS.newException();
        }
    }

    /**
     * Idempotently add the invitee to the target space as GUEST.
     */
    private void ensureSpaceMembership(CollaborationInvitation invitation) {
        Long spaceId = invitation.getSpaceId();
        if (spaceId == null && invitation.getPageId() != null) {
            Page page = pageService.getById(invitation.getPageId());
            spaceId = page != null ? page.getSpaceId() : null;
        }
        if (spaceId == null || invitation.getInviteeId() == null) {
            return;
        }
        if (!spaceMemberService.isMember(spaceId, invitation.getInviteeId())) {
            spaceMemberService.addMember(spaceId, invitation.getInviteeId(),
                    CollaboratorRole.GUEST, invitation.getInviterId());
            log.info("Added invitee {} as GUEST to space {}", invitation.getInviteeId(), spaceId);
        }
    }

    private int permissionRank(String permission) {
        if ("ADMIN".equals(permission)) return 3;
        if ("WRITE".equals(permission)) return 2;
        if ("READ".equals(permission)) return 1;
        return 0;
    }

    @Override
    public void reject(Long id) {
        collaborationInvitationService.reject(id);
    }

    @Override
    public CollaborationInvitation getById(Long id) {
        return collaborationInvitationService.getById(id);
    }

    @Override
    public List<CollaborationInvitation> getByInvitee(Long inviteeId) {
        return collaborationInvitationService.getByInvitee(inviteeId);
    }

}
