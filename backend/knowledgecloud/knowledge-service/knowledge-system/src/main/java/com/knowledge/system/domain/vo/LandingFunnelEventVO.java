package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

import java.io.Serializable;

/**
 * 落地页漏斗原始事件
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "LandingFunnelEventVO对象", description = "落地页漏斗原始事件")
public class LandingFunnelEventVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "sessionId")
	private String sessionId;

	@ApiModelProperty(value = "visitorId")
	private String visitorId;

	@ApiModelProperty(value = "eventName")
	private String eventName;

	@ApiModelProperty(value = "path")
	private String path;

	@ApiModelProperty(value = "createTime")
	private java.time.LocalDateTime createTime;
}
