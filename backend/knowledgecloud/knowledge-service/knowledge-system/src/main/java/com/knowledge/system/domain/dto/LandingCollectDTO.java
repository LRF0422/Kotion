package com.knowledge.system.domain.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.List;
import java.util.Map;

/**
 * 落地页埋点批量上报
 */
@Data
@ApiModel(value = "LandingCollectDTO对象", description = "落地页埋点批量上报")
public class LandingCollectDTO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "站点标识，缺省为 kotion-landing")
	private String siteId;

	@ApiModelProperty(value = "会话标识")
	private String sessionId;

	@ApiModelProperty(value = "访客标识")
	private String visitorId;

	@ApiModelProperty(value = "来源")
	private String referrer;

	@ApiModelProperty(value = "语言")
	private String language;

	@ApiModelProperty(value = "UTM 参数")
	private Map<String, String> utm;

	@ApiModelProperty(value = "事件列表")
	private List<LandingEventDTO> events;
}
