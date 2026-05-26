package com.knowledge.system.domain.vo;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.math.BigDecimal;
import java.util.Date;

/**
 * 订阅订单VO
 *
 * @author Qwen
 */
@Data
@ApiModel(value = "SubscriptionOrderVO对象", description = "订阅订单VO")
public class SubscriptionOrderVO {

    /**
     * 主键id
     */
    @ApiModelProperty(value = "主键")
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
     * 会员等级名称
     */
    @ApiModelProperty(value = "会员等级名称")
    private String levelName;

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
     * 创建时间
     */
    @ApiModelProperty(value = "创建时间")
    private Date createTime;
}