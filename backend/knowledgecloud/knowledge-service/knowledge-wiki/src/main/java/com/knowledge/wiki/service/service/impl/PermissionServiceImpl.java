package com.knowledge.wiki.service.service.impl;

import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageCollaborator;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.enums.CollaboratorRole;
import com.knowledge.wiki.service.entity.enums.SpaceType;
import com.knowledge.wiki.service.entity.enums.SpaceVisibility;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.service.IPageCollaboratorService;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.IPermissionService;
import com.knowledge.wiki.service.service.ISpaceMemberService;
import com.knowledge.wiki.service.service.ISpaceService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;

/**
 * Unified permission resolution.
 * Space role implied permissions: OWNER/ADMIN -> ADMIN, MEMBER -> WRITE,
 * GUEST -> none (page-level grants only). PUBLIC spaces are readable by any
 * signed-in user. Legacy non-collaboration spaces without an explicit
 * visibility remain readable to keep existing browsing behavior.
 */
@Service
public class PermissionServiceImpl implements IPermissionService {

    @Autowired
    private ISpaceService spaceService;
    @Autowired
    private IPageService pageService;
    @Autowired
    private ISpaceMemberService spaceMemberService;
    @Autowired
    private IPageCollaboratorService pageCollaboratorService;

    @Override
    public String effectivePagePermission(Long userId, Long pageId) {
        if (pageId == null) {
            return null;
        }
        Page page = pageService.getById(pageId);
        if (page == null) {
            return null;
        }
        return effectivePagePermission(userId, page);
    }

    @Override
    public String effectivePagePermission(Long userId, Page page) {
        if (userId == null || page == null) {
            return null;
        }
        Space space = page.getSpaceId() != null ? spaceService.getById(page.getSpaceId()) : null;
        String permission = effectiveSpacePermission(userId, space);

        // Page-level collaborator grant can only raise the permission
        PageCollaborator grant = pageCollaboratorService.lambdaQuery()
                .eq(PageCollaborator::getPageId, page.getId())
                .eq(PageCollaborator::getUserId, userId)
                .one();
        if (grant != null) {
            permission = max(permission, grant.getPermission());
        }
        return permission;
    }

    @Override
    public String effectiveSpacePermission(Long userId, Space space) {
        if (userId == null || space == null) {
            return null;
        }
        String currentContextId = SecurityContextUtil.getTenantId();
        if (StrUtil.isNotBlank(currentContextId) && StrUtil.isNotBlank(space.getTenantId())
                && !currentContextId.equals(space.getTenantId())) {
            return null;
        }
        // Space creator/owner always has full control
        if (userId.equals(space.getUserId())) {
            return PERMISSION_ADMIN;
        }
        CollaboratorRole role = spaceMemberService.getMemberRole(space.getId(), userId);
        if (role == CollaboratorRole.OWNER || role == CollaboratorRole.ADMIN) {
            return PERMISSION_ADMIN;
        }
        if (role == CollaboratorRole.MEMBER) {
            return PERMISSION_WRITE;
        }
        // GUEST members and non-members: only public spaces are readable
        if (space.getVisibility() == SpaceVisibility.PUBLIC) {
            return PERMISSION_READ;
        }
        // Legacy spaces (non-collaboration) without explicit visibility stay readable
        if (space.getVisibility() == null && space.getType() != SpaceType.COLLABORATION) {
            return PERMISSION_READ;
        }
        return null;
    }

    @Override
    public void checkPagePermission(Long userId, Page page, String requiredPermission) {
        int requiredRank = rank(requiredPermission);
        if (requiredRank == 0) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        String effective = effectivePagePermission(userId, page);
        if (rank(effective) < requiredRank) {
            throw WikiException.FORBIDDEN_ACCESS.newException();
        }
    }

    @Override
    public Set<Long> getGrantedPageIds(Long userId, Long spaceId) {
        if (userId == null || spaceId == null) {
            return Collections.emptySet();
        }
        List<PageCollaborator> grants = pageCollaboratorService.lambdaQuery()
                .eq(PageCollaborator::getUserId, userId)
                .list();
        if (CollUtil.isEmpty(grants)) {
            return Collections.emptySet();
        }
        List<Long> pageIds = grants.stream()
                .map(PageCollaborator::getPageId)
                .distinct()
                .collect(Collectors.toList());
        return pageService.lambdaQuery()
                .in(Page::getId, pageIds)
                .eq(Page::getSpaceId, spaceId)
                .list()
                .stream()
                .map(Page::getId)
                .collect(Collectors.toSet());
    }

    private String max(String a, String b) {
        return rank(a) >= rank(b) ? a : b;
    }

    private int rank(String permission) {
        if (PERMISSION_ADMIN.equals(permission)) {
            return 3;
        }
        if (PERMISSION_WRITE.equals(permission)) {
            return 2;
        }
        if (PERMISSION_READ.equals(permission)) {
            return 1;
        }
        return 0;
    }
}
