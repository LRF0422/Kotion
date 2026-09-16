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

import java.time.LocalDateTime;

/**
 * 落地页运营配置资源实体
 */
@Data
@TableName("landing_resource")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingResource对象", description = "落地页运营配置资源（SEO / 区块 / 促销 / 素材等）")
public class LandingResource extends BaseEntity {

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
	 * 资源种类
	 */
	@ApiModelProperty(value = "资源种类：SEO | SECTION | PROMOTION | ASSET | NAV | EMAIL_TEMPLATE | AUDIENCE | ALERT_RULE | CAMPAIGN_PAGE")
	private String resKind;

	/**
	 * 资源键
	 */
	@ApiModelProperty(value = "种类内唯一键：SEO=path、SECTION=page、PROMOTION=slot id、ASSET=file key ...")
	private String resKey;

	/**
	 * 语言
	 */
	@ApiModelProperty(value = "语言")
	private String locale;

	/**
	 * 资源负载
	 */
	@ApiModelProperty(value = "种类相关文档（JSON）")
	private String payload;

	/**
	 * 状态
	 */
	@ApiModelProperty(value = "状态：DRAFT | PUBLISHED | OFFLINE")
	private String status;

	/**
	 * 排序
	 */
	@ApiModelProperty(value = "排序")
	private Integer position;

	/**
	 * 是否启用
	 */
	@ApiModelProperty(value = "是否启用")
	private Boolean enabled;

	/**
	 * 生效开始时间
	 */
	@ApiModelProperty(value = "生效开始时间")
	private LocalDateTime startTime;

	/**
	 * 生效结束时间
	 */
	@ApiModelProperty(value = "生效结束时间")
	private LocalDateTime endTime;

	/**
	 * 备注
	 */
	@ApiModelProperty(value = "备注")
	private String remark;
}
