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
 * 落地页运营变更审计实体
 */
@Data
@TableName("landing_ops_audit")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingOpsAudit对象", description = "落地页运营变更审计")
public class LandingOpsAudit extends BaseEntity {

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
	 * 操作人
	 */
	@ApiModelProperty(value = "操作人")
	private String operator;

	/**
	 * 操作人ID
	 */
	@ApiModelProperty(value = "操作人ID")
	@JsonSerialize(using = ToStringSerializer.class)
	private Long operatorId;

	/**
	 * 操作类型
	 */
	@ApiModelProperty(value = "操作类型：SAVE_DRAFT / PUBLISH / ROLLBACK / CREATE / UPDATE / DELETE / IMPORT ...")
	private String action;

	/**
	 * 目标类型
	 */
	@ApiModelProperty(value = "目标类型：CONTENT / SEO / SECTION / PROMOTION / LINK / GOAL / FUNNEL / EXPERIMENT / SETTING ...")
	private String targetType;

	/**
	 * 目标键
	 */
	@ApiModelProperty(value = "目标键：内容 key、slug、资源 key 等")
	private String targetKey;

	/**
	 * 摘要
	 */
	@ApiModelProperty(value = "单行可读摘要")
	private String summary;

	/**
	 * 变更明细
	 */
	@ApiModelProperty(value = "变更前后负载（JSON）")
	private String detail;

	/**
	 * 客户端IP
	 */
	@ApiModelProperty(value = "客户端IP")
	private String clientIp;
}
