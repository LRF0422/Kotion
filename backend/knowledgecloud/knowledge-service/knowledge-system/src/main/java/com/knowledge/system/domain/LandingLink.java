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
 * 渠道短链实体
 */
@Data
@TableName("landing_link")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingLink对象", description = "渠道短链")
public class LandingLink extends BaseEntity {

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
	 * 目标地址
	 */
	@ApiModelProperty(value = "目标地址")
	private String target;

	/**
	 * 名称
	 */
	@ApiModelProperty(value = "名称")
	private String label;

	/**
	 * 渠道
	 */
	@ApiModelProperty(value = "渠道")
	private String channel;

	/**
	 * UTM source
	 */
	@ApiModelProperty(value = "UTM source")
	private String utmSource;

	/**
	 * UTM medium
	 */
	@ApiModelProperty(value = "UTM medium")
	private String utmMedium;

	/**
	 * UTM campaign
	 */
	@ApiModelProperty(value = "UTM campaign")
	private String utmCampaign;

	/**
	 * UTM content
	 */
	@ApiModelProperty(value = "UTM content")
	private String utmContent;

	/**
	 * 点击次数
	 */
	@ApiModelProperty(value = "点击次数")
	private Integer clicks;

	/**
	 * 是否启用
	 */
	@ApiModelProperty(value = "是否启用")
	private Boolean enabled;

	/**
	 * 渠道分组（P1-9）
	 */
	@ApiModelProperty(value = "渠道分组")
	private String groupName;

	/**
	 * 排序（P1-9）
	 */
	@ApiModelProperty(value = "排序")
	private Integer position;

	/**
	 * 备注
	 */
	@ApiModelProperty(value = "备注")
	private String remark;
}
