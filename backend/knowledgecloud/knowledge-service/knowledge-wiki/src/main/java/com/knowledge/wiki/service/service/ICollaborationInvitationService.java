package com.knowledge.wiki.service.service;

import java.util.List;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.CollaborationInvitation;

public interface ICollaborationInvitationService extends MPJBaseService<CollaborationInvitation> {

    void accept(Long id);

    void reject(Long id);

    List<CollaborationInvitation> create(List<CollaborationInvitation> invitations);

    List<CollaborationInvitation> getByInvitee(Long inviteeId);

    /**
     * Invitations of a user that are still actionable: {@code PENDING} (can be
     * accepted) and {@code ACCEPTED} (can be opened). Unlike
     * {@link #getByInvitee(Long)} this is what the invitee's home list needs —
     * the accepted ones are precisely the pages the user collaborates on.
     * Expiry is deliberately not filtered here: whether a row is still usable
     * depends on the page too, so the caller applies it.
     */
    List<CollaborationInvitation> getActiveByInvitee(Long inviteeId);

    List<CollaborationInvitation> getByPage(Long pageId);

    CollaborationInvitation getByToken(String token);

    /**
     * Get invitation by token without status filter (for validation)
     */
    CollaborationInvitation getByTokenForValidation(String token);

}
