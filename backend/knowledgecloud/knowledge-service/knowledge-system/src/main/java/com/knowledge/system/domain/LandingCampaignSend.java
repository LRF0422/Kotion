package com.knowledge.system.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.knowledge.core.common.base.BaseEntity;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 落地页活动发送记录实体
 */
@Data
@TableName("landing_campaign_send")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingCampaignSend对象", description = "落地页活动单个收件人投递记录")
public class LandingCampaignSend extends BaseEntity {

	private static final long serialVersionUID = 1L;

	/**
	 * 主键
	 */
	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.AUTO)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * 活动ID
	 */
	@ApiModelProperty(value = "活动ID")
	@JsonSerialize(using = ToStringSerializer.class)
	private Long campaignId;

	/**
	 * 订阅线索ID
	 */
	@ApiModelProperty(value = "订阅线索ID")
	@JsonSerialize(using = ToStringSerializer.class)
	private Long subscriberId;

	/**
	 * 收件邮箱
	 */
	@ApiModelProperty(value = "收件邮箱")
	private String email;

	/**
	 * 状态
	 */
	@ApiModelProperty(value = "状态：PENDING | SENT | FAILED | OPENED | CLICKED | BOUNCED | UNSUBSCRIBED")
	private String status;

	/**
	 * 错误信息
	 */
	@ApiModelProperty(value = "错误信息")
	private String error;

	/**
	 * 追踪标识
	 */
	@ApiModelProperty(value = "打开像素与点击跳转使用的追踪标识")
	private String trackingId;

	/**
	 * 发送时间
	 */
	@ApiModelProperty(value = "发送时间")
	private LocalDateTime sentAt;

	/**
	 * 打开时间
	 */
	@ApiModelProperty(value = "打开时间")
	private LocalDateTime openedAt;

	/**
	 * 点击时间
	 */
	@ApiModelProperty(value = "点击时间")
	private LocalDateTime clickedAt;

	/**
	 * 统计日
	 */
	@ApiModelProperty(value = "统计日")
	private LocalDate statDay;
}
