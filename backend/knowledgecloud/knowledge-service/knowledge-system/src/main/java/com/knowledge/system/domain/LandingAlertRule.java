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

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 落地页指标告警规则实体
 */
@Data
@TableName("landing_alert_rule")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingAlertRule对象", description = "落地页指标告警规则")
public class LandingAlertRule extends BaseEntity {

	private static final long serialVersionUID = 1L;

	/**
	 * 主键
	 */
	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.AUTO)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * 站点标识
	 */
	@ApiModelProperty(value = "站点标识")
	private String siteId;

	/**
	 * 规则名称
	 */
	@ApiModelProperty(value = "规则名称")
	private String name;

	/**
	 * 监控指标
	 */
	@ApiModelProperty(value = "监控指标：CONVERSIONS | VISITORS | PAGEVIEWS | COLLECT_SILENCE | LINK_CLICKS | GOAL_RATE")
	private String metric;

	/**
	 * 目标标识
	 */
	@ApiModelProperty(value = "metric = GOAL_RATE 时使用的目标标识")
	private String goalKey;

	/**
	 * 比较符
	 */
	@ApiModelProperty(value = "比较符：LT | LTE | GT | GTE | DROP_PCT")
	private String comparator;

	/**
	 * 阈值
	 */
	@ApiModelProperty(value = "阈值")
	private BigDecimal threshold;

	/**
	 * 窗口分钟数
	 */
	@ApiModelProperty(value = "窗口分钟数")
	private Integer windowMinutes;

	/**
	 * 回看天数
	 */
	@ApiModelProperty(value = "回看天数")
	private Integer lookbackDays;

	/**
	 * 通知渠道
	 */
	@ApiModelProperty(value = "通知渠道：log | email | webhook（逗号分隔）")
	private String channels;

	/**
	 * Webhook 地址
	 */
	@ApiModelProperty(value = "Webhook 地址")
	private String webhookUrl;

	/**
	 * 是否启用
	 */
	@ApiModelProperty(value = "是否启用")
	private Boolean enabled;

	/**
	 * 最近触发时间
	 */
	@ApiModelProperty(value = "最近触发时间")
	private LocalDateTime lastTriggeredAt;
}
