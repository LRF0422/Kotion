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
 * 落地页转化漏斗实体
 */
@Data
@TableName("landing_funnel")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingFunnel对象", description = "已保存的落地页转化漏斗")
public class LandingFunnel extends BaseEntity {

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
	 * 漏斗标识
	 */
	@ApiModelProperty(value = "漏斗标识")
	private String funnelKey;

	/**
	 * 漏斗名称
	 */
	@ApiModelProperty(value = "漏斗名称")
	private String name;

	/**
	 * 漏斗步骤
	 */
	@ApiModelProperty(value = "有序步骤（JSON）：[{ \"label\": \"...\", \"type\": \"event|path\", \"value\": \"...\" }]")
	private String steps;

	/**
	 * 漏斗说明
	 */
	@ApiModelProperty(value = "漏斗说明")
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
