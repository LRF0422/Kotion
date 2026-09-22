package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;
import java.util.List;

import lombok.Data;

/**
 * DTO for inviting members to a team space
 */
@Data
public class InviteSpaceMemberDTO implements Serializable {

    /**
     * Target space ID. Supplied by the controller from the path variable
     * ({@code /space/{spaceId}/member/invite}) and set before the service runs, so
     * it must not be required in the request body.
     */
    private Long spaceId;

    /**
     * User IDs to invite
     */
    private List<Long> userIds;

    /**
     * Emails to invite (for users not yet found by ID)
     */
    private List<String> emails;

    /**
     * Role to assign: ADMIN, MEMBER, GUEST
     */
    private String role;

    /**
     * Optional invitation message
     */
    private String message;

}
