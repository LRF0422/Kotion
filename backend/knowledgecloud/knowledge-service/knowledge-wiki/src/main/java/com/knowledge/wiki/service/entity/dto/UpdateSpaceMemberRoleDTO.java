package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

import lombok.Data;

/**
 * DTO for updating a space member's role
 */
@Data
public class UpdateSpaceMemberRoleDTO implements Serializable {

    @NotNull(message = "User ID is required")
    private Long userId;

    @NotBlank(message = "Role is required")
    private String role;

}
