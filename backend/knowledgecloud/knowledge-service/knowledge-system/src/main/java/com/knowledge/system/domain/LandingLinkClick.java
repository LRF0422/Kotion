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
 * 渠道短链点击实体
 */
@Data
@TableName("landing_link_click")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingLinkClick对象", description = "渠道短链点击")
public class LandingLinkClick extends BaseEntity {

	private static final long serialVersionUID = 1L;

	/**
	 * 主键
	 */
	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.AUTO)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * 短链标识
	 */
	@ApiModelProperty(value = "短链标识")
	private String slug;

	/**
	 * 来源
	 */
	@ApiModelProperty(value = "来源")
	private String referrer;

	/**
	 * User-Agent
	 */
	@ApiModelProperty(value = "User-Agent")
	private String ua;

	/**
	 * IP 哈希
	 */
	@ApiModelProperty(value = "IP 哈希")
	private String ipHash;

	/**
	 * 统计日
	 */
	@ApiModelProperty(value = "统计日")
	private LocalDate statDay;
}
