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

import java.math.BigDecimal;
import java.util.Date;

/**
 * 会员等级实体类
 *
 * @author Qwen
 */
@Data
@TableName("membership_level")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "MembershipLevel对象", description = "会员等级")
public class MembershipLevel extends TenantItemImpl {

    private static final long serialVersionUID = 1L;

    /**
     * 主键id
     */
    @ApiModelProperty(value = "主键")
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;

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
     * 等级描述
     */
    @ApiModelProperty(value = "等级描述")
    private String levelDesc;

    /**
     * 月付价格
     */
    @ApiModelProperty(value = "月付价格")
    private BigDecimal priceMonthly;

    /**
     * 年付价格
     */
    @ApiModelProperty(value = "年付价格")
    private BigDecimal priceYearly;

    /**
     * 权益列表(JSON格式)
     */
    @ApiModelProperty(value = "权益列表")
    private String benefits;

    /**
     * 排序
     */
    @ApiModelProperty(value = "排序")
    private Integer sort;

    /**
     * 状态(1:启用 0:禁用)
     */
    @ApiModelProperty(value = "状态")
    private Integer status;
}