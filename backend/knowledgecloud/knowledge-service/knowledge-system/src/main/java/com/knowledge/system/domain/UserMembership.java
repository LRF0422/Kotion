package com.knowledge.system.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.knowledge.core.common.base.TenantItemImpl;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Date;

/**
 * 用户会员关系实体类
 *
 * @author Qwen
 */
@Data
@TableName("user_membership")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "UserMembership对象", description = "用户会员关系")
public class UserMembership extends TenantItemImpl {

    private static final long serialVersionUID = 1L;

    /**
     * 主键id
     */
    @ApiModelProperty(value = "主键")
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;

    /**
     * 用户ID
     */
    @ApiModelProperty(value = "用户ID")
    @JsonSerialize(using = ToStringSerializer.class)
    private Long userId;

    /**
     * 会员等级ID
     */
    @ApiModelProperty(value = "会员等级ID")
    @JsonSerialize(using = ToStringSerializer.class)
    private Long levelId;

    /**
     * 等级编码
     */
    @ApiModelProperty(value = "等级编码")
    private String levelCode;

    /**
     * 会员开始时间
     */
    @ApiModelProperty(value = "会员开始时间")
    private Date startTime;

    /**
     * 会员结束时间
     */
    @ApiModelProperty(value = "会员结束时间")
    private Date endTime;

    /**
     * 是否激活
     */
    @ApiModelProperty(value = "是否激活")
    private Boolean isActive;

    /**
     * 是否自动续费
     */
    @ApiModelProperty(value = "是否自动续费")
    private Boolean autoRenew;

    /**
     * 来源订单ID
     */
    @ApiModelProperty(value = "来源订单ID")
    @JsonSerialize(using = ToStringSerializer.class)
    private Long sourceOrderId;
}