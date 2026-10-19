package com.knowledge.system.domain;

import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantItemImpl;
import com.knowledge.system.domain.enums.DeveloperIdType;
import com.knowledge.system.domain.enums.DeveloperStatus;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 开发者认证档案（系统/身份域）。每个用户至多一条。
 *
 * <p>发布 / 管理插件只认 {@link DeveloperStatus#APPROVED}；其余状态都视为未认证。
 * 证件号只在审核后台完整返回，开发者本人接口返回掩码值。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_developer")
@ApiModel(value = "Developer对象", description = "开发者认证档案")
public class Developer extends TenantItemImpl {

    private static final long serialVersionUID = 1L;

    @ApiModelProperty(value = "主键")
    @TableId(value = "id", type = IdType.ASSIGN_ID)
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
