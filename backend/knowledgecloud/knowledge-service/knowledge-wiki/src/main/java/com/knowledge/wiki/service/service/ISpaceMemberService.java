package com.knowledge.wiki.service.service;

import java.util.List;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.SpaceMember;
import com.knowledge.wiki.service.entity.dto.SpaceMemberDTO;
import com.knowledge.wiki.service.entity.enums.CollaboratorRole;

/**
 * Space Member Service Interface
 * Manages team space membership operations
 */
public interface ISpaceMemberService extends MPJBaseService<SpaceMember> {

    /**
     * Add a member to a space
     */
    SpaceMember addMember(Long spaceId, Long userId, CollaboratorRole role, Long invitedBy);

    /**
     * Remove a member from a space
     */
    void removeMember(Long spaceId, Long userId);

    /**
     * Update a member's role in a space
     */
    void updateMemberRole(Long spaceId, Long userId, CollaboratorRole role);

    /**
     * Get all members of a space
     */
    List<SpaceMember> getSpaceMembers(Long spaceId);

    /**
     * Check if a user is a member of a space
     */
    boolean isMember(Long spaceId, Long userId);

    /**
     * Get a user's role in a space
     */
    CollaboratorRole getMemberRole(Long spaceId, Long userId);

    /**
     * Get the member count of a space
     */
    int getMemberCount(Long spaceId);

    /**
     * Transfer ownership of a space to another member
     */
    void transferOwnership(Long spaceId, Long currentOwnerId, Long newOwnerId);

}
