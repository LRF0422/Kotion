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
 * 落地页公开设置实体
 */
@Data
@TableName("landing_setting")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingSetting对象", description = "落地页公开设置")
public class LandingSetting extends BaseEntity {

	private static final long serialVersionUID = 1L;

	/**
	 * 主键
	 */
	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.AUTO)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * 设置键
	 */
	@ApiModelProperty(value = "设置键")
	private String settingKey;

	/**
	 * 设置值
	 */
	@ApiModelProperty(value = "设置值")
	private String settingValue;
}
