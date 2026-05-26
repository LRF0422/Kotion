package com.knowledge.wiki.service.service;

import java.util.List;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.CollaborationInvitation;

public interface ICollaborationInvitationService extends MPJBaseService<CollaborationInvitation> {

    void accept(Long id);

    void reject(Long id);

    List<CollaborationInvitation> create(List<CollaborationInvitation> invitations);

    List<CollaborationInvitation> getByInvitee(Long inviteeId);

    List<CollaborationInvitation> getByPage(Long pageId);

    CollaborationInvitation getByToken(String token);

    /**
     * Get invitation by token without status filter (for validation)
     */
    CollaborationInvitation getByTokenForValidation(String token);

}
