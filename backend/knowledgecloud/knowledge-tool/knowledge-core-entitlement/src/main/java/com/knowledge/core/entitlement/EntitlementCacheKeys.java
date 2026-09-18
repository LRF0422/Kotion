package com.knowledge.core.entitlement;

/**
 * 权益缓存的共享键约定。
 *
 * <p>`VERSION_PREFIX + userId` 是一个自增版本号：权益权威源在授予/撤销时递增，
 * 各业务实例解析时对比本地缓存记录的版本，实现跨实例秒级失效（无需订阅）。</p>
 *
 * @author Kotion
 */
public final class EntitlementCacheKeys {

	private EntitlementCacheKeys() {
	}

	public static final String VERSION_PREFIX = "knowledge:entitlement:version:";

	/** 全局版本号：方案权益配置变更时递增，使所有用户的缓存失效。 */
	public static final String GLOBAL_VERSION = "knowledge:entitlement:version:global";
}
