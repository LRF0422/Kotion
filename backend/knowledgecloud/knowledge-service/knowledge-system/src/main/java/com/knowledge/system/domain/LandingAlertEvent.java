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

/**
 * 落地页指标告警记录实体
 */
@Data
@TableName("landing_alert_event")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingAlertEvent对象", description = "落地页指标告警发生记录")
public class LandingAlertEvent extends BaseEntity {

	private static final long serialVersionUID = 1L;

	/**
	 * 主键
	 */
	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.AUTO)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * 告警规则ID
	 */
	@ApiModelProperty(value = "告警规则ID")
	@JsonSerialize(using = ToStringSerializer.class)
	private Long ruleId;

	/**
	 * 站点标识
	 */
	@ApiModelProperty(value = "站点标识")
	private String siteId;

	/**
	 * 规则名称
	 */
	@ApiModelProperty(value = "规则名称")
	private String ruleName;

	/**
	 * 监控指标
	 */
	@ApiModelProperty(value = "监控指标")
	private String metric;

	/**
	 * 指标值
	 */
	@ApiModelProperty(value = "指标值")
	private BigDecimal metricValue;

	/**
	 * 阈值
	 */
	@ApiModelProperty(value = "阈值")
	private BigDecimal threshold;

	/**
	 * 告警级别
	 */
	@ApiModelProperty(value = "告警级别：WARN | CRITICAL")
	private String level;

	/**
	 * 告警信息
	 */
	@ApiModelProperty(value = "告警信息")
	private String message;

	/**
	 * 是否已通知
	 */
	@ApiModelProperty(value = "是否已通知")
	private Boolean notified;
}
