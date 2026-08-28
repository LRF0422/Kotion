package com.knowledge.wiki.service.service.impl;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.SpaceMember;
import com.knowledge.wiki.service.entity.enums.CollaboratorRole;
import com.knowledge.wiki.service.mapper.SpaceMemberMapper;
import com.knowledge.wiki.service.service.ISpaceMemberService;
import com.knowledge.wiki.service.service.ISpaceService;

import lombok.extern.slf4j.Slf4j;

/**
 * Space Member Service Implementation
 */
@Slf4j
@Service
public class SpaceMemberServiceImpl extends MPJBaseServiceImpl<SpaceMemberMapper, SpaceMember>
        implements ISpaceMemberService {

    @Autowired
    private ISpaceService spaceService;

    @Override
    public SpaceMember addMember(Long spaceId, Long userId, CollaboratorRole role, Long invitedBy) {
        // Check if already a member
        Space space = spaceService.getById(spaceId);
        if (space == null) {
            throw new IllegalArgumentException("Space not found: " + spaceId);
        }
        if (isMember(spaceId, userId)) {
            log.info("User {} is already a member of space {}", userId, spaceId);
            SpaceMember existing = lambdaQuery()
                    .eq(SpaceMember::getSpaceId, spaceId)
                    .eq(SpaceMember::getUserId, userId)
                    .one();
            if (existing.getTenantId() == null && space.getTenantId() != null) {
                existing.setTenantId(space.getTenantId());
                updateById(existing);
            }
            return existing;
        }

        SpaceMember member = new SpaceMember();
        member.setTenantId(space.getTenantId());
        member.setSpaceId(spaceId);
        member.setUserId(userId);
        member.setRole(role);
        member.setJoinedAt(LocalDateTime.now());
        member.setInvitedBy(invitedBy);
        this.save(member);
        log.info("Added user {} as {} to space {}", userId, role, spaceId);
        return member;
    }

    @Override
    public void removeMember(Long spaceId, Long userId) {
        boolean removed = lambdaUpdate()
                .eq(SpaceMember::getSpaceId, spaceId)
                .eq(SpaceMember::getUserId, userId)
                .remove();
        if (removed) {
            log.info("Removed user {} from space {}", userId, spaceId);
        }
    }

    @Override
    public void updateMemberRole(Long spaceId, Long userId, CollaboratorRole role) {
        lambdaUpdate()
                .eq(SpaceMember::getSpaceId, spaceId)
                .eq(SpaceMember::getUserId, userId)
                .set(SpaceMember::getRole, role)
                .update();
        log.info("Updated user {} role to {} in space {}", userId, role, spaceId);
    }

    @Override
    public List<SpaceMember> getSpaceMembers(Long spaceId) {
        return lambdaQuery()
                .eq(SpaceMember::getSpaceId, spaceId)
                .orderByAsc(SpaceMember::getJoinedAt)
                .list();
    }

    @Override
    public boolean isMember(Long spaceId, Long userId) {
        return lambdaQuery()
                .eq(SpaceMember::getSpaceId, spaceId)
                .eq(SpaceMember::getUserId, userId)
                .exists();
    }

    @Override
    public CollaboratorRole getMemberRole(Long spaceId, Long userId) {
        SpaceMember member = lambdaQuery()
                .eq(SpaceMember::getSpaceId, spaceId)
                .eq(SpaceMember::getUserId, userId)
                .one();
        return member != null ? member.getRole() : null;
    }

    @Override
    public int getMemberCount(Long spaceId) {
        Long count = lambdaQuery()
                .eq(SpaceMember::getSpaceId, spaceId)
                .count();
        return count != null ? count.intValue() : 0;
    }

    @Override
    public void transferOwnership(Long spaceId, Long currentOwnerId, Long newOwnerId) {
        // Legacy spaces may record ownership only in Space.userId. Materialize both
        // membership rows before changing roles so the former owner retains ADMIN.
        addMember(spaceId, currentOwnerId, CollaboratorRole.ADMIN, null);
        addMember(spaceId, newOwnerId, CollaboratorRole.OWNER, currentOwnerId);
        updateMemberRole(spaceId, currentOwnerId, CollaboratorRole.ADMIN);
        updateMemberRole(spaceId, newOwnerId, CollaboratorRole.OWNER);
        log.info("Transferred ownership of space {} from user {} to user {}", spaceId, currentOwnerId, newOwnerId);
    }

}
