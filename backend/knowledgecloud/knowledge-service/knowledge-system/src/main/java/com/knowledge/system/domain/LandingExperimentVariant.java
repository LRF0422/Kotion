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

/**
 * 落地页 A/B 实验分组实体
 */
@Data
@TableName("landing_experiment_variant")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingExperimentVariant对象", description = "落地页 A/B 实验分组")
public class LandingExperimentVariant extends BaseEntity {

	private static final long serialVersionUID = 1L;

	/**
	 * 主键
	 */
	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.AUTO)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * 实验ID
	 */
	@ApiModelProperty(value = "实验ID")
	@JsonSerialize(using = ToStringSerializer.class)
	private Long experimentId;

	/**
	 * 分组标识
	 */
	@ApiModelProperty(value = "分组标识：control / a / b ...")
	private String variantKey;

	/**
	 * 分组名称
	 */
	@ApiModelProperty(value = "分组名称")
	private String name;

	/**
	 * 权重
	 */
	@ApiModelProperty(value = "组内相对权重（总和不要求等于 100）")
	private Integer weight;

	/**
	 * 是否对照组
	 */
	@ApiModelProperty(value = "是否对照组")
	private Boolean isControl;

	/**
	 * 分组负载
	 */
	@ApiModelProperty(value = "落地页消费的分组文案 / 属性（JSON）")
	private String payload;

	/**
	 * 排序
	 */
	@ApiModelProperty(value = "排序")
	private Integer position;
}
