package com.knowledge.core.entitlement;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 权益门禁配置。
 *
 * @author Kotion
 */
@Data
@ConfigurationProperties(prefix = "knowledge.entitlement")
public class EntitlementProperties {

	/** 是否启用权益门禁自动装配。 */
	private boolean enabled = true;

	/** 进程内解析缓存 TTL（秒）。 */
	private long cacheTtlSeconds = 60L;
}
