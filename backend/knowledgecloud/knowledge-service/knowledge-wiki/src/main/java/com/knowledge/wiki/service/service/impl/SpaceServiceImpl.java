package com.knowledge.wiki.service.service.impl;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.knowledge.core.common.base.BaseService;
import com.knowledge.core.common.base.Icon;
import com.knowledge.core.common.base.IconType;
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
            if (space.getType() != SpaceType.TEMPALTE) {
                createHomePage(space);
            }
            log.info("Space created with ID: {}", space.getId());
        }
        return space;
    }

    private void createHomePage(Space space) {
        Page newPage = new Page();
        newPage.setSpaceId(space.getId());
        newPage.setTitle("Welcome to " + space.getName());
        Icon icon = new Icon();
        icon.setIcon("😄");
        icon.setType(IconType.EMOJI);
        newPage.setIcon(icon);
        // No client-authored JSON or fixed block IDs: createPage builds and stores
        // the canonical title + paragraph PageDoc in this space transaction.
        Page homePage = pageService.createPage(newPage, true);
        space.setHomePageId(homePage.getId());
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
