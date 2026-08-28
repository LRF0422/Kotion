package com.knowledge.system.domain.vo;

import java.io.Serializable;
import java.time.LocalDateTime;

import lombok.Data;

@Data
public class OrganizationInvitationVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String token;
    private LocalDateTime expiresAt;
}
