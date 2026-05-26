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
 * 订阅订单实体类
 *
 * @author Qwen
 */
@Data
@TableName("subscription_order")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "SubscriptionOrder对象", description = "订阅订单")
public class SubscriptionOrder extends TenantItemImpl {

    private static final long serialVersionUID = 1L;

    /**
     * 主键id
     */
    @ApiModelProperty(value = "主键")
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;

    /**
     * 订单号
     */
    @ApiModelProperty(value = "订单号")
    private String orderNo;

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
     * 订阅类型
     */
    @ApiModelProperty(value = "订阅类型")
    private String subscriptionType;

    /**
     * 订单金额
     */
    @ApiModelProperty(value = "订单金额")
    private BigDecimal amount;

    /**
     * 订单状态
     */
    @ApiModelProperty(value = "订单状态")
    private String status;

    /**
     * 支付方式
     */
    @ApiModelProperty(value = "支付方式")
    private String paymentMethod;

    /**
     * 二维码URL
     */
    @ApiModelProperty(value = "二维码URL")
    private String qrCodeUrl;

    /**
     * 支付截止时间
     */
    @ApiModelProperty(value = "支付截止时间")
    private Date paymentDeadline;

    /**
     * 支付完成时间
     */
    @ApiModelProperty(value = "支付完成时间")
    private Date paidTime;

    /**
     * 生效时间
     */
    @ApiModelProperty(value = "生效时间")
    private Date effectiveTime;

    /**
     * 到期时间
     */
    @ApiModelProperty(value = "到期时间")
    private Date expiryTime;

    /**
     * 第三方交易号
     */
    @ApiModelProperty(value = "第三方交易号")
    private String tradeNo;
}