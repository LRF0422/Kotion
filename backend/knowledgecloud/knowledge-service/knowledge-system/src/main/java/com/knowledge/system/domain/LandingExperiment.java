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

import java.time.LocalDateTime;

/**
 * 落地页 A/B 实验实体
 */
@Data
@TableName("landing_experiment")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingExperiment对象", description = "落地页 A/B 实验")
public class LandingExperiment extends BaseEntity {

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
	 * 实验标识
	 */
	@ApiModelProperty(value = "落地页 useExperiment(key) 使用的稳定标识")
	private String expKey;

	/**
	 * 实验名称
	 */
	@ApiModelProperty(value = "实验名称")
	private String name;

	/**
	 * 实验假设
	 */
	@ApiModelProperty(value = "实验假设")
	private String hypothesis;

	/**
	 * 状态
	 */
	@ApiModelProperty(value = "状态：DRAFT | RUNNING | PAUSED | FINISHED")
	private String status;

	/**
	 * 流量比例
	 */
	@ApiModelProperty(value = "进入实验的访客占比（0-100）")
	private Integer trafficSplit;

	/**
	 * 主指标事件
	 */
	@ApiModelProperty(value = "主转化事件")
	private String metricEvent;

	/**
	 * 护栏说明
	 */
	@ApiModelProperty(value = "护栏说明")
	private String guardrailNote;

	/**
	 * 开始时间
	 */
	@ApiModelProperty(value = "开始时间")
	private LocalDateTime startTime;

	/**
	 * 结束时间
	 */
	@ApiModelProperty(value = "结束时间")
	private LocalDateTime endTime;
}
