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
 * 落地页事件字典实体
 */
@Data
@TableName("landing_event_dict")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingEventDict对象", description = "落地页埋点事件与属性注册表")
public class LandingEventDict extends BaseEntity {

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
	 * 事件名
	 */
	@ApiModelProperty(value = "事件名")
	private String eventName;

	/**
	 * 事件分类
	 */
	@ApiModelProperty(value = "事件分类：NAV / CONVERSION / ENGAGEMENT / FORM / EXPERIMENT / QUALITY / GENERAL")
	private String category;

	/**
	 * 事件说明
	 */
	@ApiModelProperty(value = "事件说明")
	private String description;

	/**
	 * 属性契约
	 */
	@ApiModelProperty(value = "属性契约（JSON）：{ \"propName\": { \"type\": \"...\", \"required\": true } }")
	private String propsSchema;

	/**
	 * 状态
	 */
	@ApiModelProperty(value = "状态：REGISTERED | DEPRECATED")
	private String status;

	/**
	 * 负责人
	 */
	@ApiModelProperty(value = "负责人")
	private String owner;
}
