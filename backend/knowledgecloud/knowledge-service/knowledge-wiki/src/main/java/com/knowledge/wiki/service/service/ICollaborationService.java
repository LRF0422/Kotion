package com.knowledge.wiki.service.service;

import java.util.List;

import com.knowledge.wiki.service.entity.CollaborationInvitation;
import com.knowledge.wiki.service.entity.Collaborator;

public interface ICollaborationService {

        List<CollaborationInvitation> createCollaborationInvitation(
                        List<CollaborationInvitation> collaborationInvitations);

        CollaborationInvitation getById(Long id);

        Collaborator accept(Long id);

        Collaborator acceptByToken(String token);

        void reject(Long id);

        List<CollaborationInvitation> getByInvitee(Long inviteeId);

}
