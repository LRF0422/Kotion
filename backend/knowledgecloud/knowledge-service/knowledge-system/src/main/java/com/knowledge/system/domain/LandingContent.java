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
 * 落地页文案实体
 */
@Data
@TableName("landing_content")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingContent对象", description = "落地页文案")
public class LandingContent extends BaseEntity {

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
	 * 草稿(JSON)
	 */
	@ApiModelProperty(value = "草稿(JSON)")
	private String draft;

	/**
	 * 已发布(JSON)
	 */
	@ApiModelProperty(value = "已发布(JSON)")
	private String published;

	/**
	 * 内容版本
	 */
	@ApiModelProperty(value = "内容版本")
	private Integer contentVersion;

	/**
	 * 发布时间
	 */
	@ApiModelProperty(value = "发布时间")
	private LocalDateTime publishedAt;

	/**
	 * 更新人
	 */
	@ApiModelProperty(value = "更新人")
	private String updatedBy;
}
