package com.knowledge.core.entitlement.constant;

/**
 * 权益编码的唯一定义处。
 *
 * <p>业务代码只允许引用这里的常量，禁止散落字符串字面量；新增权益必须同时在
 * `subscription_entitlement` 里登记定义。</p>
 *
 * @author Kotion
 */
public final class EntitlementCodes {

	private EntitlementCodes() {
	}

	public static final String CORE_EDITOR = "core.editor";
	public static final String SPACE_COUNT = "space.count";
	public static final String SPACE_MEMBERS = "space.members";
	public static final String STORAGE_BYTES = "storage.bytes";
	public static final String FILE_MAX_SIZE = "file.maxSize";
	public static final String AI_AGENT = "ai.agent";
	/** 每日 AI 次数（用户可见口径；一次用户消息触发的完整 run 算一次）。 */
	public static final String AI_RUNS_DAILY = "ai.runs.daily";
	/** 月度 AI 积分（按模型单价 × token 折算，反映真实成本）。 */
	public static final String AI_CREDITS_MONTHLY = "ai.credits.monthly";
	public static final String AI_RUNS_CONCURRENT = "ai.runs.concurrent";
	public static final String AI_ADVANCED_MODELS = "ai.advancedModels";
	public static final String PLUGIN_INSTALL = "plugin.install";
	public static final String PLUGIN_INSTALLED_COUNT = "plugin.installed.count";
	public static final String PLUGIN_PUBLISH = "plugin.publish";
	public static final String EXPORT_PDF = "export.pdf";
	public static final String COLLABORATION_TEAM = "collaboration.team";
	public static final String COLLABORATION_GUEST = "collaboration.guest";
	public static final String SUPPORT_PRIORITY = "support.priority";
}
