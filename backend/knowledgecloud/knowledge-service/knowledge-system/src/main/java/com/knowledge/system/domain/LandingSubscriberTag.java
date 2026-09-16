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
 * 落地页订阅标签实体
 */
@Data
@TableName("landing_subscriber_tag")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingSubscriberTag对象", description = "落地页订阅标签")
public class LandingSubscriberTag extends BaseEntity {

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
	 * 标签名
	 */
	@ApiModelProperty(value = "标签名")
	private String tag;

	/**
	 * 标签颜色
	 */
	@ApiModelProperty(value = "标签颜色")
	private String color;

	/**
	 * 标签说明
	 */
	@ApiModelProperty(value = "标签说明")
	private String description;
}
