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
 * 落地页转化目标实体
 */
@Data
@TableName("landing_goal")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingGoal对象", description = "落地页转化目标")
public class LandingGoal extends BaseEntity {

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
	 * 目标标识
	 */
	@ApiModelProperty(value = "看板使用的稳定标识")
	private String goalKey;

	/**
	 * 目标名称
	 */
	@ApiModelProperty(value = "目标名称")
	private String name;

	/**
	 * 步骤类型
	 */
	@ApiModelProperty(value = "步骤类型：EVENT | PATH")
	private String stepType;

	/**
	 * 步骤值
	 */
	@ApiModelProperty(value = "事件名或路径表达式")
	private String stepValue;

	/**
	 * 目标说明
	 */
	@ApiModelProperty(value = "目标说明")
	private String description;

	/**
	 * 是否启用
	 */
	@ApiModelProperty(value = "是否启用")
	private Boolean enabled;

	/**
	 * 排序
	 */
	@ApiModelProperty(value = "排序")
	private Integer position;
}
