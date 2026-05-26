package com.knowledge.wiki.service.service;

import com.knowledge.core.common.base.IBaseService;
import com.knowledge.wiki.service.entity.Space;

public interface ISpaceService extends IBaseService<Space> {

    ISpacePermissionService getSpacePermissionService();

    IPageService getPageService();

    ICollaborationService getCollaborationService();

    Space createOrSave(Space space);

    Space getPersonalSpace(Long userId);

    void acceptInvitation(Long id);

    void acceptInvitationByToken(String token);

    void rejectInvitation(Long id);
}
