package com.knowledge.core.entitlement;

import com.knowledge.core.entitlement.model.EntitlementSnapshot;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 权益门禁统一入口：解析 + 短时缓存 + 便捷判断。
 *
 * <p>业务代码注入本类即可判断能力/配额；MVC 拦截器也走这里。</p>
 *
 * @author Kotion
 */
public class EntitlementGate {

	private final EntitlementResolver resolver;
	private final long ttlMillis;
	private final ConcurrentHashMap<Long, Cached> cache = new ConcurrentHashMap<>();

	public EntitlementGate(EntitlementResolver resolver, long cacheTtlSeconds) {
		this.resolver = resolver;
		this.ttlMillis = Math.max(0L, cacheTtlSeconds) * 1000L;
	}

	public EntitlementSnapshot resolve(Long userId) {
		if (userId == null) {
			return EntitlementSnapshot.free();
		}
		long now = System.currentTimeMillis();
		Cached cached = cache.get(userId);
		if (cached != null && now - cached.at < ttlMillis) {
			return cached.snapshot;
		}
		EntitlementSnapshot snapshot = resolver.resolve(userId);
		if (snapshot == null) {
			snapshot = EntitlementSnapshot.free();
		}
		cache.put(userId, new Cached(snapshot, now));
		return snapshot;
	}

	/** 是否具备某能力。未知编码为 false。 */
	public boolean hasFeature(Long userId, String code) {
		Map<String, Boolean> features = resolve(userId).getFeatures();
		return features != null && Boolean.TRUE.equals(features.get(code));
	}

	/** 取某数值配额。未知编码为 0，-1 表示不限。 */
	public long getQuota(Long userId, String code) {
		Map<String, Long> quotas = resolve(userId).getQuotas();
		Long value = quotas == null ? null : quotas.get(code);
		return value == null ? 0L : value;
	}

	/** 订阅变更后主动失效缓存。 */
	public void evict(Long userId) {
		if (userId != null) {
			cache.remove(userId);
		}
	}

	public void evictAll() {
		cache.clear();
	}

	private static final class Cached {
		private final EntitlementSnapshot snapshot;
		private final long at;

		private Cached(EntitlementSnapshot snapshot, long at) {
			this.snapshot = snapshot;
			this.at = at;
		}
	}
}
