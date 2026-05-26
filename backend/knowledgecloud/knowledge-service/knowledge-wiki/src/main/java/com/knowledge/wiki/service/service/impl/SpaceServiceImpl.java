package com.knowledge.wiki.service.service.impl;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.knowledge.core.common.base.BaseService;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.wiki.service.converter.SpaceConverter;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.enums.SpaceType;
import com.knowledge.wiki.service.mapper.SpaceMapper;
import com.knowledge.wiki.service.service.ICollaborationService;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.ISpacePermissionService;
import com.knowledge.wiki.service.service.ISpaceService;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class SpaceServiceImpl extends BaseService<SpaceMapper, Space> implements ISpaceService {

    @Autowired
    @Getter
    private IPageService pageService;
    @Autowired
    @Getter
    private ISpacePermissionService spacePermissionService;
    @Autowired
    @Getter
    private ICollaborationService collaborationService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Space createOrSave(Space space) {
        if (space.getId() != null) {
            log.debug("Updating space: {}", space.getId());
            Space db = this.getById(space.getId());
            SpaceConverter.INSTANCE.update(space, db);
            this.updateById(db);
        } else {
            log.debug("Creating new space: {}", space.getName());
            if (space.getType() == null) {
                space.setType(SpaceType.SPACE);
            }
            this.save(space);
            createHomePage(space);
            log.info("Space created with ID: {}", space.getId());
        }
        return space;
    }

    private void createHomePage(Space space) {
        Page newPage = new Page();
        newPage.setSpaceId(space.getId());
        newPage.setTitle("Welcome to " + space.getName());
        newPage.setContent(
                String.format(
                        "{\"type\": \"doc\", \"attrs\": {\"id\": null, \"cover\": null, \"title\": null, \"comment\": [], \"creator\": null, \"createDate\": null, \"updateDate\": null}, \"content\": [{\"type\": \"title\", \"attrs\": {\"id\": \"33672345-63ce-4f4c-b8d7-9b4d3aca27a2\", \"icon\": {\"icon\": \"😄\", \"type\": \"EMOJI\"}, \"uuid\": null, \"cover\": null}, \"content\": [{\"type\": \"heading\", \"attrs\": {\"id\": \"778a858f-69d3-4e7e-931a-2eabc157dc15\", \"level\": 1, \"textAlign\": null, \"data-toc-id\": \"778a858f-69d3-4e7e-931a-2eabc157dc15\"}, \"content\": [{\"text\": \"Welcome to %s !!\", \"type\": \"text\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"id\": \"b0143e14-1d87-4293-bd25-0363134d76b2\", \"indent\": 0, \"textAlign\": null}}]}",
                        space.getName()));
        Page homePage = pageService.createPage(newPage, true);
        this.lambdaUpdate()
                .eq(Space::getId, space.getId())
                .set(Space::getHomePageId, homePage.getId())
                .update();
    }

    @Override
    public Space getPersonalSpace(Long userId) {

        Space personalSpace = this.lambdaQuery()
                .eq(Space::getUserId, userId)
                .eq(Space::getType, SpaceType.PERSONAL)
                .one();
        if (personalSpace == null) {
            personalSpace = new Space();
            personalSpace.setName(SecurityContextUtil.getUserName() + "的空间");
            personalSpace.setType(SpaceType.PERSONAL);
            personalSpace.setUserId(userId);
            personalSpace.setNickName(SecurityContextUtil.getUserName());
            createOrSave(personalSpace);
        }
        return personalSpace;
    }

    @Override
    public void acceptInvitation(Long id) {
        collaborationService.accept(id);
    }

    @Override
    public void acceptInvitationByToken(String token) {
        collaborationService.acceptByToken(token);
    }

    @Override
    public void rejectInvitation(Long id) {
        collaborationService.reject(id);
    }

}
