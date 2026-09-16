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
 * 落地页触达活动实体
 */
@Data
@TableName("landing_campaign")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingCampaign对象", description = "落地页邮件 / 触达活动")
public class LandingCampaign extends BaseEntity {

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
	 * 活动名称
	 */
	@ApiModelProperty(value = "活动名称")
	private String name;

	/**
	 * 邮件主题
	 */
	@ApiModelProperty(value = "邮件主题")
	private String subject;

	/**
	 * 预览文本
	 */
	@ApiModelProperty(value = "预览文本")
	private String preheader;

	/**
	 * 模板键
	 */
	@ApiModelProperty(value = "EMAIL_TEMPLATE 类型的 landing_resource 键")
	private String templateKey;

	/**
	 * 内联模板
	 */
	@ApiModelProperty(value = "内联模板（template_key 为空时使用）")
	private String bodyHtml;

	/**
	 * 受众选择
	 */
	@ApiModelProperty(value = "受众选择器（JSON）：{ status, tags[], utmSource, days }")
	private String audience;

	/**
	 * 状态
	 */
	@ApiModelProperty(value = "状态：DRAFT | SCHEDULED | SENDING | SENT | FAILED | CANCELLED")
	private String status;

	/**
	 * 计划发送时间
	 */
	@ApiModelProperty(value = "计划发送时间")
	private LocalDateTime scheduledAt;

	/**
	 * 开始时间
	 */
	@ApiModelProperty(value = "开始时间")
	private LocalDateTime startedAt;

	/**
	 * 结束时间
	 */
	@ApiModelProperty(value = "结束时间")
	private LocalDateTime finishedAt;

	/**
	 * 目标总数
	 */
	@ApiModelProperty(value = "目标总数")
	private Integer totalCount;

	/**
	 * 发送成功数
	 */
	@ApiModelProperty(value = "发送成功数")
	private Integer sentCount;

	/**
	 * 发送失败数
	 */
	@ApiModelProperty(value = "发送失败数")
	private Integer failedCount;

	/**
	 * 打开数
	 */
	@ApiModelProperty(value = "打开数")
	private Integer openCount;

	/**
	 * 点击数
	 */
	@ApiModelProperty(value = "点击数")
	private Integer clickCount;

	/**
	 * 退订数
	 */
	@ApiModelProperty(value = "退订数")
	private Integer unsubscribeCount;

	/**
	 * 测试邮箱
	 */
	@ApiModelProperty(value = "测试邮箱")
	private String testEmail;
}
