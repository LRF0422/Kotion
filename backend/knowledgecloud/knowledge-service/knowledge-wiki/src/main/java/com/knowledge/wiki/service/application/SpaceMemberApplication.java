package com.knowledge.wiki.service.application;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.feign.IUserClient;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.SpaceMember;
import com.knowledge.wiki.service.entity.dto.InviteSpaceMemberDTO;
import com.knowledge.wiki.service.entity.dto.SpaceMemberDTO;
import com.knowledge.wiki.service.entity.dto.UpdateSpaceMemberRoleDTO;
import com.knowledge.wiki.service.entity.enums.CollaboratorRole;
import com.knowledge.wiki.service.entity.enums.SpaceType;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.service.ISpaceMemberService;
import com.knowledge.wiki.service.service.ISpaceService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.collection.ListUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * Space Member Application Service
 * Business logic for team space member management
 */
@Slf4j
@Service
public class SpaceMemberApplication {

    @Autowired
    private ISpaceMemberService spaceMemberService;

    @Autowired
    private ISpaceService spaceService;

    @Autowired
    private IUserClient userClient;

    @Autowired
    private SpaceActivityApplication spaceActivityApplication;

    /**
     * List all members of a space with user details
     */
    public List<SpaceMemberDTO> listMembers(Long spaceId) {
        List<SpaceMember> members = spaceMemberService.getSpaceMembers(spaceId);
        if (CollUtil.isEmpty(members)) {
            // If no members in table, return owner from space record
            Space space = spaceService.getById(spaceId);
            if (space != null && space.getUserId() != null) {
                return buildOwnerFallback(space);
            }
            return ListUtil.empty();
        }

        // Get user details
        List<Long> userIds = members.stream()
                .map(SpaceMember::getUserId)
                .collect(Collectors.toList());
        R<List<KnowledgeUser>> usersRes = userClient.listByIds(userIds);
        List<KnowledgeUser> users = usersRes.getData();

        if (CollUtil.isEmpty(users)) {
            return ListUtil.empty();
        }

        Map<Long, KnowledgeUser> userMap = users.stream()
                .collect(Collectors.toMap(KnowledgeUser::getUserId, u -> u, (a, b) -> a));

        return members.stream()
                .map(member -> {
                    KnowledgeUser user = userMap.get(member.getUserId());
                    if (user == null)
                        return null;
                    SpaceMemberDTO dto = new SpaceMemberDTO();
                    dto.setId(user.getUserId());
                    dto.setName(user.getUserName());
                    dto.setEmail(user.getEmail());
                    // dto.setAvatar(user.getAvatar());
                    dto.setRole(member.getRole().getCode());
                    dto.setJoinedAt(member.getJoinedAt());
                    return dto;
                })
                .filter(m -> m != null)
                .collect(Collectors.toList());
    }

    /**
     * Invite members to a team space
     */
    @Transactional(rollbackFor = Exception.class)
    public void inviteMembers(InviteSpaceMemberDTO dto) {
        Long spaceId = dto.getSpaceId();
        Long currentUserId = SecurityContextUtil.getUserId();

        // Verify current user has invite permission (OWNER or ADMIN)
        verifyInvitePermission(spaceId, currentUserId);

        CollaboratorRole role = CollaboratorRole.fromCode(
                dto.getRole() != null ? dto.getRole() : "MEMBER");

        // Cannot invite as OWNER
        if (role == CollaboratorRole.OWNER) {
            role = CollaboratorRole.ADMIN;
        }

        List<Long> userIds = dto.getUserIds();
        if (CollUtil.isEmpty(userIds)) {
            // Try to resolve by emails
            if (CollUtil.isNotEmpty(dto.getEmails())) {
                R<List<KnowledgeUser>> usersRes = userClient.getByAccount(dto.getEmails());
                if (usersRes.getData() != null) {
                    userIds = usersRes.getData().stream()
                            .map(KnowledgeUser::getUserId)
                            .collect(Collectors.toList());
                }
            }
        }

        if (CollUtil.isEmpty(userIds)) {
            log.warn("No valid users found to invite to space {}", spaceId);
            return;
        }

        for (Long userId : userIds) {
            spaceMemberService.addMember(spaceId, userId, role, currentUserId);
        }

        // Record activity for each invited member
        for (Long userId : userIds) {
            try {
                spaceActivityApplication.recordMemberActivity(spaceId, "MEMBER_JOINED", userId, null);
            } catch (Exception e) {
                log.warn("Failed to record member joined activity", e);
            }
        }

        log.info("Invited {} members to space {} with role {}", userIds.size(), spaceId, role);
    }

    /**
     * Update a member's role
     */
    public void updateMemberRole(Long spaceId, UpdateSpaceMemberRoleDTO dto) {
        Long currentUserId = SecurityContextUtil.getUserId();
        verifyAdminPermission(spaceId, currentUserId);

        CollaboratorRole newRole = CollaboratorRole.fromCode(dto.getRole());
        // Cannot set role to OWNER via this endpoint
        if (newRole == CollaboratorRole.OWNER) {
            throw WikiException.INVALID_PARAMETER.newException();
        }

        spaceMemberService.updateMemberRole(spaceId, dto.getUserId(), newRole);

        // Record activity
        try {
            java.util.Map<String, Object> extra = new java.util.HashMap<>();
            extra.put("newRole", newRole.getCode());
            spaceActivityApplication.recordMemberActivity(spaceId, "MEMBER_ROLE_CHANGED", dto.getUserId(), extra);
        } catch (Exception e) {
            log.warn("Failed to record role change activity", e);
        }
    }

    /**
     * Remove a member from the space
     */
    public void removeMember(Long spaceId, Long userId) {
        Long currentUserId = SecurityContextUtil.getUserId();
        verifyAdminPermission(spaceId, currentUserId);

        // Cannot remove the owner
        CollaboratorRole targetRole = spaceMemberService.getMemberRole(spaceId, userId);
        if (targetRole == CollaboratorRole.OWNER) {
            throw WikiException.INVALID_PARAMETER.newException();
        }

        spaceMemberService.removeMember(spaceId, userId);
    }

    /**
     * Leave a space (current user)
     */
    public void leaveSpace(Long spaceId) {
        Long currentUserId = SecurityContextUtil.getUserId();
        CollaboratorRole role = spaceMemberService.getMemberRole(spaceId, currentUserId);

        // Owner cannot leave without transferring ownership
        if (role == CollaboratorRole.OWNER) {
            throw WikiException.INVALID_PARAMETER.newException();
        }

        spaceMemberService.removeMember(spaceId, currentUserId);

        // Record activity
        try {
            spaceActivityApplication.recordMemberActivity(spaceId, "MEMBER_LEFT", currentUserId, null);
        } catch (Exception e) {
            log.warn("Failed to record member left activity", e);
        }
    }

    /**
     * Transfer ownership of a space
     */
    @Transactional(rollbackFor = Exception.class)
    public void transferOwnership(Long spaceId, Long newOwnerId) {
        Long currentUserId = SecurityContextUtil.getUserId();

        // Only the current owner can transfer
        CollaboratorRole currentRole = spaceMemberService.getMemberRole(spaceId, currentUserId);
        if (currentRole != CollaboratorRole.OWNER) {
            throw WikiException.INVALID_PARAMETER.newException();
        }

        // Verify new owner is a member
        if (!spaceMemberService.isMember(spaceId, newOwnerId)) {
            throw WikiException.INVALID_PARAMETER.newException();
        }

        spaceMemberService.transferOwnership(spaceId, currentUserId, newOwnerId);

        // Also update the space's userId field
        Space space = spaceService.getById(spaceId);
        if (space != null) {
            space.setUserId(newOwnerId);
            spaceService.updateById(space);
        }
    }

    // --- Helper methods ---

    private void verifyInvitePermission(Long spaceId, Long userId) {
        CollaboratorRole role = spaceMemberService.getMemberRole(spaceId, userId);
        if (role == null) {
            // Check if owner from Space record (backward compat)
            Space space = spaceService.getById(spaceId);
            if (space != null && userId.equals(space.getUserId())) {
                return; // Owner
            }
            throw WikiException.INVALID_PARAMETER.newException();
        }
        if (role != CollaboratorRole.OWNER && role != CollaboratorRole.ADMIN) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
    }

    private void verifyAdminPermission(Long spaceId, Long userId) {
        CollaboratorRole role = spaceMemberService.getMemberRole(spaceId, userId);
        if (role == null) {
            Space space = spaceService.getById(spaceId);
            if (space != null && userId.equals(space.getUserId())) {
                return;
            }
            throw WikiException.INVALID_PARAMETER.newException();
        }
        if (role != CollaboratorRole.OWNER && role != CollaboratorRole.ADMIN) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
    }

    private List<SpaceMemberDTO> buildOwnerFallback(Space space) {
        R<KnowledgeUser> userRes = userClient.getUserById(space.getUserId());
        if (userRes.getData() == null) {
            return ListUtil.empty();
        }
        KnowledgeUser user = userRes.getData();
        SpaceMemberDTO dto = new SpaceMemberDTO();
        dto.setId(user.getUserId());
        dto.setName(user.getUserName());
        dto.setEmail(user.getEmail());
        // dto.setAvatar(user.getAvatar());
        dto.setRole(CollaboratorRole.OWNER.getCode());
        dto.setJoinedAt(space.getCreateTime());
        List<SpaceMemberDTO> result = new ArrayList<>();
        result.add(dto);
        return result;
    }

}
