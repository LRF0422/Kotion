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
 * 落地页订阅标签关联实体
 */
@Data
@TableName("landing_subscriber_tag_rel")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingSubscriberTagRel对象", description = "落地页订阅线索与标签关联")
public class LandingSubscriberTagRel extends BaseEntity {

	private static final long serialVersionUID = 1L;

	/**
	 * 主键
	 */
	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.AUTO)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * 订阅线索ID
	 */
	@ApiModelProperty(value = "订阅线索ID")
	@JsonSerialize(using = ToStringSerializer.class)
	private Long subscriberId;

	/**
	 * 标签ID
	 */
	@ApiModelProperty(value = "标签ID")
	@JsonSerialize(using = ToStringSerializer.class)
	private Long tagId;
}
