package com.knowledge.system.domain.vo;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.util.Date;

/**
 * 用户会员信息VO
 *
 * @author Qwen
 */
@Data
@ApiModel(value = "UserMembershipVO对象", description = "用户会员信息VO")
public class UserMembershipVO {

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
     * 等级名称
     */
    @ApiModelProperty(value = "等级名称")
    private String levelName;

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
     * 剩余天数
     */
    @ApiModelProperty(value = "剩余天数")
    private Integer remainingDays;
}