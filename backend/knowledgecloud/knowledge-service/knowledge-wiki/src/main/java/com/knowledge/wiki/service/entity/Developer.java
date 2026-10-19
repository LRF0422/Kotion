package com.knowledge.wiki.service.entity;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.wiki.service.entity.enums.DeveloperIdType;
import com.knowledge.wiki.service.entity.enums.DeveloperStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 开发者认证档案。每个用户至多一条（{@code wiki_developer.uk_developer_user}）。
 *
 * <p>发布 / 管理插件只认 {@link DeveloperStatus#APPROVED}；其余状态都视为未认证。
 * 证件号只在审核后台完整返回，开发者本人接口返回掩码值。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_developer")
public class Developer extends TenantEntity {

    private Long id;
    private Long userId;
    private String userName;
    private String displayName;
    private String contactName;
    private String contactEmail;
    private String contactPhone;
    private DeveloperIdType idType;
    private String idNumber;
    private String intro;
    private String qualificationPath;
    private DeveloperStatus status;
    private String rejectReason;
    private String reviewComment;
    private Long reviewerId;
    private String reviewerName;
    private LocalDateTime reviewTime;

}
