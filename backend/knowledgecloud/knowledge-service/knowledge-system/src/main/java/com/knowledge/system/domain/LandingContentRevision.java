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
 * 落地页文案版本实体
 */
@Data
@TableName("landing_content_revision")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingContentRevision对象", description = "落地页文案版本")
public class LandingContentRevision extends BaseEntity {

	private static final long serialVersionUID = 1L;

	/**
	 * 主键
	 */
	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.AUTO)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * 内容键
	 */
	@ApiModelProperty(value = "内容键")
	private String contentKey;

	/**
	 * 语言
	 */
	@ApiModelProperty(value = "语言")
	private String locale;

	/**
	 * 内容版本
	 */
	@ApiModelProperty(value = "内容版本")
	private Integer contentVersion;

	/**
	 * 版本内容(JSON)
	 */
	@ApiModelProperty(value = "版本内容(JSON)")
	private String payload;

	/**
	 * 备注
	 */
	@ApiModelProperty(value = "备注")
	private String note;

	/**
	 * 操作人
	 */
	@ApiModelProperty(value = "操作人")
	private String createdBy;
}
