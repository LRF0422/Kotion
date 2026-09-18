package com.knowledge.core.entitlement.model;

import com.knowledge.core.entitlement.constant.EntitlementCodes;
import lombok.Data;

import java.io.Serializable;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 某用户当前生效的权益快照（跨服务传输对象）。
 *
 * @author Kotion
 */
@Data
public class EntitlementSnapshot implements Serializable {

	private static final long serialVersionUID = 1L;

	private Long userId;

	private String planCode;

	private String planName;

	private Integer tier;

	/** 能力开关：code -> 是否可用。 */
	private Map<String, Boolean> features = new LinkedHashMap<>();

	/** 数值配额：code -> 额度（-1 不限）。 */
	private Map<String, Long> quotas = new LinkedHashMap<>();

	/**
	 * 未订阅/解析失败时的免费版兜底（fail-closed：取最小权益）。
	 *
	 * <p>这里显式带上免费版额度，避免权益服务不可用时 {@code getQuota} 全部退化成 0
	 * 而把所有功能都拦死。数值与 V36 的 FREE 种子保持一致，改动时需同步。</p>
	 */
	public static EntitlementSnapshot free() {
		EntitlementSnapshot snapshot = new EntitlementSnapshot();
		snapshot.setPlanCode("FREE");
		snapshot.setPlanName("免费版");
		snapshot.setTier(0);

		Map<String, Boolean> features = snapshot.getFeatures();
		features.put(EntitlementCodes.CORE_EDITOR, true);
		features.put(EntitlementCodes.AI_AGENT, true);
		features.put(EntitlementCodes.PLUGIN_INSTALL, true);
		features.put(EntitlementCodes.AI_ADVANCED_MODELS, false);
		features.put(EntitlementCodes.PLUGIN_PUBLISH, false);
		features.put(EntitlementCodes.EXPORT_PDF, false);
		features.put(EntitlementCodes.COLLABORATION_TEAM, false);
		features.put(EntitlementCodes.COLLABORATION_GUEST, false);
		features.put(EntitlementCodes.SUPPORT_PRIORITY, false);

		Map<String, Long> quotas = snapshot.getQuotas();
		quotas.put(EntitlementCodes.SPACE_COUNT, 3L);
		quotas.put(EntitlementCodes.SPACE_MEMBERS, 1L);
		quotas.put(EntitlementCodes.STORAGE_BYTES, 1073741824L);
		quotas.put(EntitlementCodes.FILE_MAX_SIZE, 67108864L);
		quotas.put(EntitlementCodes.AI_TOKENS_DAILY, 50000L);
		quotas.put(EntitlementCodes.AI_RUNS_CONCURRENT, 1L);
		quotas.put(EntitlementCodes.PLUGIN_INSTALLED_COUNT, 3L);
		return snapshot;
	}
}
