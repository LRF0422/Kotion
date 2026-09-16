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
 * 落地页推荐码实体
 */
@Data
@TableName("landing_referral")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingReferral对象", description = "落地页邀请 / 推荐码")
public class LandingReferral extends BaseEntity {

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
	 * 推荐码
	 */
	@ApiModelProperty(value = "公开推荐码")
	private String code;

	/**
	 * 归属类型
	 */
	@ApiModelProperty(value = "归属类型：USER | PARTNER | CAMPAIGN")
	private String ownerType;

	/**
	 * 归属ID
	 */
	@ApiModelProperty(value = "归属ID")
	private String ownerId;

	/**
	 * 归属名称
	 */
	@ApiModelProperty(value = "归属名称")
	private String ownerName;

	/**
	 * 目标地址
	 */
	@ApiModelProperty(value = "目标地址")
	private String target;

	/**
	 * 点击数
	 */
	@ApiModelProperty(value = "点击数")
	private Integer clicks;

	/**
	 * 注册数
	 */
	@ApiModelProperty(value = "注册数")
	private Integer signups;

	/**
	 * 激活数
	 */
	@ApiModelProperty(value = "激活数")
	private Integer activations;

	/**
	 * 是否启用
	 */
	@ApiModelProperty(value = "是否启用")
	private Boolean enabled;
}
