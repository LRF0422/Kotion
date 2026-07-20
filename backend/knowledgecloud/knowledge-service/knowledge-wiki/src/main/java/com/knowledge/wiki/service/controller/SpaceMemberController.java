package com.knowledge.wiki.service.controller;

import java.util.List;

import javax.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.application.SpaceMemberApplication;
import com.knowledge.wiki.service.entity.dto.InviteSpaceMemberDTO;
import com.knowledge.wiki.service.entity.dto.SpaceMemberDTO;
import com.knowledge.wiki.service.entity.dto.UpdateSpaceMemberRoleDTO;

/**
 * Space Member Controller
 * Manages team space membership operations
 */
@RestController
@RequestMapping("/space/{spaceId}/member")
public class SpaceMemberController {

    @Autowired
    private SpaceMemberApplication spaceMemberApplication;

    /**
     * Get all members of a space
     * GET /knowledge-wiki/space/{spaceId}/member/list
     */
    @GetMapping("/list")
    public R<List<SpaceMemberDTO>> listMembers(@PathVariable("spaceId") Long spaceId) {
        return R.data(spaceMemberApplication.listMembers(spaceId));
    }

    /**
     * Invite members to a space
     * POST /knowledge-wiki/space/{spaceId}/member/invite
     */
    @PostMapping("/invite")
    public R<?> inviteMembers(@PathVariable("spaceId") Long spaceId,
            @Valid @RequestBody InviteSpaceMemberDTO dto) {
        dto.setSpaceId(spaceId);
        spaceMemberApplication.inviteMembers(dto);
        return R.success();
    }

    /**
     * Update a member's role
     * PUT /knowledge-wiki/space/{spaceId}/member/role
     */
    @PutMapping("/role")
    public R<?> updateMemberRole(@PathVariable("spaceId") Long spaceId,
            @Valid @RequestBody UpdateSpaceMemberRoleDTO dto) {
        spaceMemberApplication.updateMemberRole(spaceId, dto);
        return R.success();
    }

    /**
     * Remove a member from the space
     * DELETE /knowledge-wiki/space/{spaceId}/member/{userId}
     */
    @DeleteMapping("/{userId}")
    public R<?> removeMember(@PathVariable("spaceId") Long spaceId,
            @PathVariable("userId") Long userId) {
        spaceMemberApplication.removeMember(spaceId, userId);
        return R.success();
    }

    /**
     * Leave a space (current user)
     * POST /knowledge-wiki/space/{spaceId}/member/leave
     */
    @PostMapping("/leave")
    public R<?> leaveSpace(@PathVariable("spaceId") Long spaceId) {
        spaceMemberApplication.leaveSpace(spaceId);
        return R.success();
    }

    /**
     * Transfer ownership
     * PUT /knowledge-wiki/space/{spaceId}/member/transfer/{newOwnerId}
     */
    @PutMapping("/transfer/{newOwnerId}")
    public R<?> transferOwnership(@PathVariable("spaceId") Long spaceId,
            @PathVariable("newOwnerId") Long newOwnerId) {
        spaceMemberApplication.transferOwnership(spaceId, newOwnerId);
        return R.success();
    }

}
