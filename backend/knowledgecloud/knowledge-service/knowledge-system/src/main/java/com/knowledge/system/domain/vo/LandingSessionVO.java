package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

import java.io.Serializable;

/**
 * 落地页会话明细
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "LandingSessionVO对象", description = "落地页会话明细")
public class LandingSessionVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "id")
	private Long id;

	@ApiModelProperty(value = "visitorId")
	private String visitorId;

	@ApiModelProperty(value = "landingPath")
	private String landingPath;

	@ApiModelProperty(value = "referrer")
	private String referrer;

	@ApiModelProperty(value = "utmSource")
	private String utmSource;

	@ApiModelProperty(value = "utmMedium")
	private String utmMedium;

	@ApiModelProperty(value = "utmCampaign")
	private String utmCampaign;

	@ApiModelProperty(value = "device")
	private String device;

	@ApiModelProperty(value = "browser")
	private String browser;

	@ApiModelProperty(value = "os")
	private String os;

	@ApiModelProperty(value = "language")
	private String language;

	@ApiModelProperty(value = "firstSeen")
	private java.time.LocalDateTime firstSeen;

	@ApiModelProperty(value = "lastSeen")
	private java.time.LocalDateTime lastSeen;

	@ApiModelProperty(value = "pageviews")
	private Long pageviews;

	@ApiModelProperty(value = "events")
	private Long events;
}
