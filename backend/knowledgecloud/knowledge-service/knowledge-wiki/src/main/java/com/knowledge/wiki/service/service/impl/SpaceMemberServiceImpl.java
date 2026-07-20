package com.knowledge.wiki.service.service.impl;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.SpaceMember;
import com.knowledge.wiki.service.entity.enums.CollaboratorRole;
import com.knowledge.wiki.service.mapper.SpaceMemberMapper;
import com.knowledge.wiki.service.service.ISpaceMemberService;

import lombok.extern.slf4j.Slf4j;

/**
 * Space Member Service Implementation
 */
@Slf4j
@Service
public class SpaceMemberServiceImpl extends MPJBaseServiceImpl<SpaceMemberMapper, SpaceMember>
        implements ISpaceMemberService {

    @Override
    public SpaceMember addMember(Long spaceId, Long userId, CollaboratorRole role, Long invitedBy) {
        // Check if already a member
        if (isMember(spaceId, userId)) {
            log.info("User {} is already a member of space {}", userId, spaceId);
            return lambdaQuery()
                    .eq(SpaceMember::getSpaceId, spaceId)
                    .eq(SpaceMember::getUserId, userId)
                    .one();
        }

        SpaceMember member = new SpaceMember();
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
        // Demote current owner to ADMIN
        updateMemberRole(spaceId, currentOwnerId, CollaboratorRole.ADMIN);
        // Promote new owner
        updateMemberRole(spaceId, newOwnerId, CollaboratorRole.OWNER);
        log.info("Transferred ownership of space {} from user {} to user {}", spaceId, currentOwnerId, newOwnerId);
    }

}
