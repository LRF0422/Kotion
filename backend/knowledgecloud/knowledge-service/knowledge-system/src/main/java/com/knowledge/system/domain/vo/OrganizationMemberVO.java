package com.knowledge.system.domain.vo;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

import lombok.Data;

@Data
public class OrganizationMemberVO implements Serializable {

    private static final long serialVersionUID = 1L;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long userId;

    private String account;
    private String name;
    private String avatar;
    private String displayName;
    private String jobTitle;
    private String memberRole;
    private Integer status;
    private LocalDateTime joinedAt;
    private LocalDateTime invitationExpiresAt;
}
