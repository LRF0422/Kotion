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

/**
 * 落地页实验曝光实体
 */
@Data
@TableName("landing_experiment_exposure")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingExperimentExposure对象", description = "落地页实验曝光（每个访客每个实验一行）")
public class LandingExperimentExposure extends BaseEntity {

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
	@ApiModelProperty(value = "实验标识")
	private String expKey;

	/**
	 * 分组标识
	 */
	@ApiModelProperty(value = "分组标识")
	private String variantKey;

	/**
	 * 访客标识
	 */
	@ApiModelProperty(value = "访客标识")
	private String visitorId;

	/**
	 * 会话标识
	 */
	@ApiModelProperty(value = "会话标识")
	private String sessionId;

	/**
	 * 是否转化
	 */
	@ApiModelProperty(value = "是否转化")
	private Boolean converted;

	/**
	 * 转化事件
	 */
	@ApiModelProperty(value = "转化事件")
	private String conversionEvent;

	/**
	 * 统计日
	 */
	@ApiModelProperty(value = "统计日")
	private LocalDate statDay;
}
