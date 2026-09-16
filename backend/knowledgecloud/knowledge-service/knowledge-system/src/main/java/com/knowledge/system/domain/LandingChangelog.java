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
 * 更新日志缓存实体
 */
@Data
@TableName("landing_changelog")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingChangelog对象", description = "更新日志缓存")
public class LandingChangelog extends BaseEntity {

	private static final long serialVersionUID = 1L;

	/**
	 * 主键
	 */
	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.AUTO)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * Release ID
	 */
	@ApiModelProperty(value = "Release ID")
	private String releaseId;

	/**
	 * Tag
	 */
	@ApiModelProperty(value = "Tag")
	private String tag;

	/**
	 * 标题
	 */
	@ApiModelProperty(value = "标题")
	private String name;

	/**
	 * 正文
	 */
	@ApiModelProperty(value = "正文")
	private String body;

	/**
	 * 链接
	 */
	@ApiModelProperty(value = "链接")
	private String url;

	/**
	 * 作者
	 */
	@ApiModelProperty(value = "作者")
	private String author;

	/**
	 * 预发布
	 */
	@ApiModelProperty(value = "预发布")
	private Boolean prerelease;

	/**
	 * 置顶
	 */
	@ApiModelProperty(value = "置顶")
	private Boolean pinned;

	/**
	 * 隐藏
	 */
	@ApiModelProperty(value = "隐藏")
	private Boolean hidden;

	/**
	 * 发布时间
	 */
	@ApiModelProperty(value = "发布时间")
	private LocalDateTime publishedAt;

	/**
	 * 抓取时间
	 */
	@ApiModelProperty(value = "抓取时间")
	private LocalDateTime fetchedAt;
}
