package com.knowledge.system.domain;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_organization_member")
public class OrganizationMember extends TenantEntity {

    private static final long serialVersionUID = 1L;

    @TableId(value = "id", type = IdType.ASSIGN_ID)
    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long userId;

    private String memberRole;
    private Integer status;
    private String displayName;
    private String jobTitle;
    private String invitationToken;
    private LocalDateTime invitationExpiresAt;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long invitedBy;

    private LocalDateTime joinedAt;
}
