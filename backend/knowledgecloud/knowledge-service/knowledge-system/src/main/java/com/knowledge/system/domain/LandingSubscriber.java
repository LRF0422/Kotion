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
 * 落地页订阅线索实体
 */
@Data
@TableName("landing_subscriber")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingSubscriber对象", description = "落地页订阅线索")
public class LandingSubscriber extends BaseEntity {

	private static final long serialVersionUID = 1L;

	/**
	 * 主键
	 */
	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.AUTO)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * 邮箱
	 */
	@ApiModelProperty(value = "邮箱")
	private String email;

	/**
	 * 状态
	 */
	@ApiModelProperty(value = "状态")
	private String status;

	/**
	 * 来源页面
	 */
	@ApiModelProperty(value = "来源页面")
	private String sourcePath;

	/**
	 * 来源
	 */
	@ApiModelProperty(value = "来源")
	private String referrer;

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
	 * IP 哈希
	 */
	@ApiModelProperty(value = "IP 哈希")
	private String ipHash;

	/**
	 * 备注
	 */
	@ApiModelProperty(value = "备注")
	private String note;

	/**
	 * 双重确认令牌（P1-10）
	 */
	@ApiModelProperty(value = "双重确认令牌")
	private String confirmToken;

	/**
	 * 确认时间
	 */
	@ApiModelProperty(value = "确认时间")
	private java.time.LocalDateTime confirmedAt;

	/**
	 * 公开退订令牌
	 */
	@ApiModelProperty(value = "公开退订令牌")
	private String unsubscribeToken;

	/**
	 * 标签快照（导出用，逗号分隔）
	 */
	@ApiModelProperty(value = "标签快照")
	private String tags;
}
