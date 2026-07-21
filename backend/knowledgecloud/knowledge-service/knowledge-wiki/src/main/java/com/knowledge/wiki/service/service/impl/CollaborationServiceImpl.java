package com.knowledge.wiki.service.service.impl;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.knowledge.core.message.core.IEventBus;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.entity.CollaborationInvitation;
import com.knowledge.wiki.service.entity.Collaborator;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageCollaborator;
import com.knowledge.wiki.service.entity.enums.CollaboratorRole;
import com.knowledge.wiki.service.entity.event.InvitationAcceptEvent;
import com.knowledge.wiki.service.service.ICollaborationInvitationService;
import com.knowledge.wiki.service.service.ICollaborationService;
import com.knowledge.wiki.service.service.ICollaboratorService;
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
    private ICollaboratorService collaboratorService;
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
    public Collaborator accept(Long id) {
        collaborationInvitationService.accept(id);
        CollaborationInvitation invitation = collaborationInvitationService.getById(id);
        return createCollaboratorFromInvitation(invitation, id);
    }

    @Override
    public Collaborator acceptByToken(String token) {
        CollaborationInvitation invitation = collaborationInvitationService.getByToken(token);
        if (invitation == null) {
            throw WikiException.INVITATION_NOT_FOUND.newException();
        }
        collaborationInvitationService.accept(invitation.getId());
        return createCollaboratorFromInvitation(invitation, invitation.getId());
    }

    private Collaborator createCollaboratorFromInvitation(CollaborationInvitation invitation, Long invitationId) {
        // Create Collaborator record
        Collaborator collaborator = new Collaborator();
        collaborator.setUserId(invitation.getInviteeId());
        collaboratorService.save(collaborator);

        // Create PageCollaborator record if pageId is present
        if (invitation.getPageId() != null) {
            // Check if page collaborator already exists
            boolean exists = pageCollaboratorService.lambdaQuery()
                    .eq(PageCollaborator::getPageId, invitation.getPageId())
                    .eq(PageCollaborator::getUserId, invitation.getInviteeId())
                    .exists();

            if (!exists) {
                PageCollaborator pageCollaborator = new PageCollaborator();
                pageCollaborator.setPageId(invitation.getPageId());
                pageCollaborator.setUserId(invitation.getInviteeId());
                pageCollaborator.setPermission(invitation.getPermission());
                pageCollaborator.setInvitedBy(invitation.getInviterId());
                pageCollaborator.setCreatedAt(LocalDateTime.now());
                pageCollaborator.setUpdatedAt(LocalDateTime.now());
                pageCollaboratorService.save(pageCollaborator);
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
