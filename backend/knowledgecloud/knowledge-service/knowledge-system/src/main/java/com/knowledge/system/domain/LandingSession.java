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
 * 落地页会话实体
 */
@Data
@TableName("landing_session")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingSession对象", description = "落地页会话")
public class LandingSession extends BaseEntity {

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
	 * 会话唯一键
	 */
	@ApiModelProperty(value = "会话唯一键")
	private String sessionKey;

	/**
	 * 访客标识
	 */
	@ApiModelProperty(value = "访客标识")
	private String visitorId;

	/**
	 * 首次访问
	 */
	@ApiModelProperty(value = "首次访问")
	private LocalDateTime firstSeen;

	/**
	 * 最近访问
	 */
	@ApiModelProperty(value = "最近访问")
	private LocalDateTime lastSeen;

	/**
	 * 落地路径
	 */
	@ApiModelProperty(value = "落地路径")
	private String landingPath;

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
	 * UTM content
	 */
	@ApiModelProperty(value = "UTM content")
	private String utmContent;

	/**
	 * UTM term
	 */
	@ApiModelProperty(value = "UTM term")
	private String utmTerm;

	/**
	 * 设备
	 */
	@ApiModelProperty(value = "设备")
	private String device;

	/**
	 * 浏览器
	 */
	@ApiModelProperty(value = "浏览器")
	private String browser;

	/**
	 * 操作系统
	 */
	@ApiModelProperty(value = "操作系统")
	private String os;

	/**
	 * 国家/地区
	 */
	@ApiModelProperty(value = "国家/地区")
	private String country;

	/**
	 * 语言
	 */
	@ApiModelProperty(value = "语言")
	private String language;
}
