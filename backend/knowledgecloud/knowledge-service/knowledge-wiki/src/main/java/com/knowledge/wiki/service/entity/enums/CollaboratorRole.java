package com.knowledge.wiki.service.entity.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * Collaborator Role Enum
 * Defines roles for space and page collaborators
 */
@Getter
@AllArgsConstructor
public enum CollaboratorRole {

    /**
     * Space owner - full control over space
     */
    OWNER("OWNER", "Owner"),

    /**
     * Space admin - can manage members and permissions
     */
    ADMIN("ADMIN", "Admin"),

    /**
     * Regular member - basic access rights
     */
    MEMBER("MEMBER", "Member"),

    /**
     * Guest - read-only access
     */
    GUEST("GUEST", "Guest");

    private final String code;
    private final String description;

    public static CollaboratorRole fromCode(String code) {
        for (CollaboratorRole role : values()) {
            if (role.getCode().equals(code)) {
                return role;
            }
        }
        return MEMBER; // default
    }
}
