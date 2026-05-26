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
 * 支付记录实体类
 *
 * @author Qwen
 */
@Data
@TableName("payment_record")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "PaymentRecord对象", description = "支付记录")
public class PaymentRecord extends TenantItemImpl {

    private static final long serialVersionUID = 1L;

    /**
     * 主键id
     */
    @ApiModelProperty(value = "主键")
    @TableId(value = "id", type = IdType.ASSIGN_ID)
    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;

    /**
     * 第三方交易号
     */
    @ApiModelProperty(value = "第三方交易号")
    private String tradeNo;

    /**
     * 订单ID
     */
    @ApiModelProperty(value = "订单ID")
    @JsonSerialize(using = ToStringSerializer.class)
    private Long orderId;

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
     * 支付金额
     */
    @ApiModelProperty(value = "支付金额")
    private BigDecimal amount;

    /**
     * 支付方式
     */
    @ApiModelProperty(value = "支付方式")
    private String paymentMethod;

    /**
     * 支付状态
     */
    @ApiModelProperty(value = "支付状态")
    private String status;

    /**
     * 支付完成时间
     */
    @ApiModelProperty(value = "支付完成时间")
    private Date paidTime;

    /**
     * 渠道交易号
     */
    @ApiModelProperty(value = "渠道交易号")
    private String channelTradeNo;

    /**
     * 渠道返回数据
     */
    @ApiModelProperty(value = "渠道返回数据")
    private String channelData;
}