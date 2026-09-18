package com.knowledge.core.entitlement;

import com.knowledge.core.entitlement.error.EntitlementErrorCodes;
import com.knowledge.core.entitlement.error.EntitlementException;
import com.knowledge.core.entitlement.model.EntitlementSnapshot;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 权益门禁统一入口：解析 + 本地缓存 + Redis 版本号跨实例失效 + 校验助手。
 *
 * <p>业务代码注入本类即可判断能力/配额；MVC 拦截器也走这里。</p>
 *
 * @author Kotion
 */
public class EntitlementGate {

	private final EntitlementResolver resolver;
	private final long ttlMillis;
	private final ObjectProvider<StringRedisTemplate> redisProvider;
	private final ConcurrentHashMap<Long, Cached> cache = new ConcurrentHashMap<>();

	public EntitlementGate(EntitlementResolver resolver, long cacheTtlSeconds,
			ObjectProvider<StringRedisTemplate> redisProvider) {
		this.resolver = resolver;
		this.ttlMillis = Math.max(0L, cacheTtlSeconds) * 1000L;
		this.redisProvider = redisProvider;
	}

	public EntitlementSnapshot resolve(Long userId) {
		if (userId == null) {
			return EntitlementSnapshot.free();
		}
		long now = System.currentTimeMillis();
		Long version = readVersion(userId);
		Cached cached = cache.get(userId);
		if (cached != null && now - cached.at < ttlMillis
				&& (version == null || Objects.equals(version, cached.version))) {
			return cached.snapshot;
		}
		EntitlementSnapshot snapshot = resolver.resolve(userId);
		if (snapshot == null) {
			snapshot = EntitlementSnapshot.free();
		}
		cache.put(userId, new Cached(snapshot, now, version));
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

	/** 能力不足时抛统一错误码异常。 */
	public void requireFeature(Long userId, String code, String message) {
		if (!hasFeature(userId, code)) {
			throw new EntitlementException(EntitlementErrorCodes.ENTITLEMENT_REQUIRED, code,
					message == null ? "当前套餐不支持该功能，请升级方案" : message);
		}
	}

	/**
	 * 额度校验：{@code limit > 0 且 used + delta > limit} 时拒绝。
	 * {@code limit <= 0}（未配置或 -1 不限）放行。
	 */
	public void requireQuota(Long userId, String code, long used, long delta, String message) {
		long limit = getQuota(userId, code);
		if (limit > 0 && used + delta > limit) {
			throw new EntitlementException(EntitlementErrorCodes.QUOTA_EXCEEDED, code,
					message == null ? "已超出套餐额度，请升级方案" : message);
		}
	}

	/** 订阅变更后主动失效本地缓存。 */
	public void evict(Long userId) {
		if (userId != null) {
			cache.remove(userId);
		}
	}

	public void evictAll() {
		cache.clear();
	}

	private Long readVersion(Long userId) {
		StringRedisTemplate redis = redisProvider == null ? null : redisProvider.getIfAvailable();
		if (redis == null) {
			return null;
		}
		try {
			String value = redis.opsForValue().get(EntitlementCacheKeys.VERSION_PREFIX + userId);
			return value == null ? null : Long.parseLong(value);
		} catch (Exception e) {
			return null;
		}
	}

	private static final class Cached {
		private final EntitlementSnapshot snapshot;
		private final long at;
		private final Long version;

		private Cached(EntitlementSnapshot snapshot, long at, Long version) {
			this.snapshot = snapshot;
			this.at = at;
			this.version = version;
		}
	}
}
