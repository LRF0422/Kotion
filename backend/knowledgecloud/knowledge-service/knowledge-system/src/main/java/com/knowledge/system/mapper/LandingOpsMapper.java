package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 运营增强统计 Mapper（V32~V34）。
 *
 * <p>与 {@link LandingStatsMapper} 一样是全局维度聚合，忽略租户行拦截器。
 * 聚合结果统一以 Map 返回，避免为每个口径新增一个 VO 类。</p>
 */
@InterceptorIgnore(tenantLine = "true")
public interface LandingOpsMapper {

	/**
	 * 命中某个事件的转化数/访客数/会话数。
	 */
	@Select("SELECT COUNT(*) AS conversions, " +
		"COUNT(DISTINCT visitor_id) AS visitors, " +
		"COUNT(DISTINCT session_id) AS sessions " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND event_name = #{eventName} " +
		"AND stat_day >= #{startDay} AND stat_day <= #{endDay} AND is_deleted = 0")
	Map<String, Object> selectEventConversions(@Param("siteId") String siteId,
		@Param("eventName") String eventName,
		@Param("startDay") String startDay,
		@Param("endDay") String endDay);

	/**
	 * 命中某个路径的浏览量/访客数/会话数（仅 pageview）。
	 */
	@Select("SELECT COUNT(*) AS conversions, " +
		"COUNT(DISTINCT visitor_id) AS visitors, " +
		"COUNT(DISTINCT session_id) AS sessions " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND event_name = 'pageview' AND path = #{path} " +
		"AND stat_day >= #{startDay} AND stat_day <= #{endDay} AND is_deleted = 0")
	Map<String, Object> selectPathConversions(@Param("siteId") String siteId,
		@Param("path") String path,
		@Param("startDay") String startDay,
		@Param("endDay") String endDay);

	/**
	 * 区间内总访客数（转化率分母）。
	 */
	@Select("SELECT COUNT(DISTINCT visitor_id) AS visitors FROM landing_event " +
		"WHERE site_id = #{siteId} AND stat_day >= #{startDay} AND stat_day <= #{endDay} AND is_deleted = 0")
	Map<String, Object> selectTotalVisitors(@Param("siteId") String siteId,
		@Param("startDay") String startDay,
		@Param("endDay") String endDay);

	/**
	 * 区间内实际收到的事件（用于事件字典覆盖率比对）。
	 */
	@Select("SELECT event_name AS name, COUNT(*) AS `count`, COUNT(DISTINCT visitor_id) AS visitors " +
		"FROM landing_event WHERE site_id = #{siteId} AND stat_day >= #{startDay} AND is_deleted = 0 " +
		"GROUP BY event_name ORDER BY `count` DESC")
	List<Map<String, Object>> selectObservedEvents(@Param("siteId") String siteId,
		@Param("startDay") String startDay);

	/**
	 * 短链点击 → 目标转化对比。
	 *
	 * <p>归因口径：落地页出站/事件上报时会把短链 slug 写入 utm_content，
	 * 因此用 utm_content = slug 关联。没有该约定的历史数据不计入转化。</p>
	 */
	@Select("SELECT l.slug AS slug, l.label AS label, l.channel AS channel, l.group_name AS groupName, " +
		"(SELECT COUNT(*) FROM landing_link_click c WHERE c.slug = l.slug " +
		"  AND c.stat_day >= #{startDay} AND c.is_deleted = 0) AS clicks, " +
		"COUNT(DISTINCT e.visitor_id) AS visitors, " +
		"COUNT(DISTINCT CASE WHEN e.event_name IN ('subscribe', 'template_use', 'plugin_install') " +
		"  THEN e.visitor_id END) AS conversions " +
		"FROM landing_link l " +
		"LEFT JOIN landing_event e ON e.site_id = l.site_id AND e.utm_content = l.slug " +
		"  AND e.stat_day >= #{startDay} AND e.is_deleted = 0 " +
		"WHERE l.is_deleted = 0 " +
		"GROUP BY l.id, l.slug, l.label, l.channel, l.group_name " +
		"ORDER BY clicks DESC")
	List<Map<String, Object>> selectLinkConversions(@Param("startDay") String startDay);

	/**
	 * 每个标签下的人群规模。
	 */
	@Select("SELECT r.tag_id AS tagId, COUNT(*) AS total FROM landing_subscriber_tag_rel r " +
		"JOIN landing_subscriber s ON s.id = r.subscriber_id AND s.is_deleted = 0 " +
		"WHERE r.is_deleted = 0 GROUP BY r.tag_id")
	List<Map<String, Object>> selectTagSizes();

	/**
	 * 运营工作台计数：待发布草稿。
	 */
	@Select("SELECT COUNT(*) FROM landing_content WHERE is_deleted = 0 " +
		"AND draft IS NOT NULL AND (published IS NULL OR published_at IS NULL OR update_time > published_at)")
	int countPendingDrafts();

	/**
	 * 运营工作台计数：近 N 天新增订阅。
	 */
	@Select("SELECT COUNT(*) FROM landing_subscriber WHERE is_deleted = 0 AND create_time >= #{since}")
	int countNewSubscribers(@Param("since") java.time.LocalDateTime since);

	/**
	 * 运营工作台计数：即将到期的推广位（N 天内结束且仍启用）。
	 */
	@Select("SELECT COUNT(*) FROM landing_resource WHERE is_deleted = 0 AND res_kind = 'PROMOTION' " +
		"AND enabled = 1 AND end_time IS NOT NULL AND end_time BETWEEN NOW() AND #{until}")
	int countExpiringPromotions(@Param("until") java.time.LocalDateTime until);

	/**
	 * 运营工作台计数：运行中的实验。
	 */
	@Select("SELECT COUNT(*) FROM landing_experiment WHERE is_deleted = 0 AND status = 'RUNNING'")
	int countRunningExperiments();

	/**
	 * 运营工作台计数：告警数量（近 N 小时）。
	 */
	@Select("SELECT COUNT(*) FROM landing_alert_event WHERE is_deleted = 0 AND create_time >= #{since}")
	int countRecentAlerts(@Param("since") java.time.LocalDateTime since);

	/**
	 * 运营工作台计数：近 N 天新增且未隐藏的更新日志（待运营处理）。
	 */
	@Select("SELECT COUNT(*) FROM landing_changelog WHERE is_deleted = 0 AND hidden = 0 " +
		"AND published_at >= #{since}")
	int countRecentChangelog(@Param("since") java.time.LocalDateTime since);

	/**
	 * 实验分组结果：曝光数、转化数。
	 */
	@Select("SELECT variant_key AS variantKey, COUNT(*) AS exposures, " +
		"SUM(CASE WHEN converted = 1 THEN 1 ELSE 0 END) AS conversions " +
		"FROM landing_experiment_exposure " +
		"WHERE site_id = #{siteId} AND exp_key = #{expKey} AND stat_day >= #{startDay} AND is_deleted = 0 " +
		"GROUP BY variant_key")
	List<Map<String, Object>> selectExperimentResults(@Param("siteId") String siteId,
		@Param("expKey") String expKey,
		@Param("startDay") String startDay);

	/**
	 * 按会话归因筛选订阅者（活动人群预估）。
	 */
	@Select("<script>" +
		"SELECT COUNT(*) FROM landing_subscriber WHERE is_deleted = 0 " +
		"<if test='status != null and status != \"\"'> AND status = #{status}</if>" +
		"<if test='utmSource != null and utmSource != \"\"'> AND utm_source = #{utmSource}</if>" +
		"<if test='days != null and days > 0'> AND create_time &gt;= #{since}</if>" +
		"</script>")
	int countAudience(@Param("status") String status,
		@Param("utmSource") String utmSource,
		@Param("days") Integer days,
		@Param("since") java.time.LocalDateTime since);

	/**
	 * 活动人群样本邮箱。
	 */
	@Select("<script>" +
		"SELECT email FROM landing_subscriber WHERE is_deleted = 0 " +
		"<if test='status != null and status != \"\"'> AND status = #{status}</if>" +
		"<if test='utmSource != null and utmSource != \"\"'> AND utm_source = #{utmSource}</if>" +
		"<if test='days != null and days > 0'> AND create_time &gt;= #{since}</if>" +
		" ORDER BY create_time DESC LIMIT #{limit}" +
		"</script>")
	List<String> selectAudienceSample(@Param("status") String status,
		@Param("utmSource") String utmSource,
		@Param("days") Integer days,
		@Param("since") java.time.LocalDateTime since,
		@Param("limit") int limit);

	/**
	 * 活动人群完整邮箱（发送时使用）。
	 */
	@Select("<script>" +
		"SELECT id, email FROM landing_subscriber WHERE is_deleted = 0 AND email IS NOT NULL " +
		"<if test='status != null and status != \"\"'> AND status = #{status}</if>" +
		"<if test='utmSource != null and utmSource != \"\"'> AND utm_source = #{utmSource}</if>" +
		"<if test='days != null and days > 0'> AND create_time &gt;= #{since}</if>" +
		" ORDER BY create_time DESC LIMIT #{limit}" +
		"</script>")
	List<Map<String, Object>> selectAudienceRows(@Param("status") String status,
		@Param("utmSource") String utmSource,
		@Param("days") Integer days,
		@Param("since") java.time.LocalDateTime since,
		@Param("limit") int limit);

	/**
	 * 距最近一条埋点事件的分钟数（COLLECT_SILENCE 告警）。
	 *
	 * <p>从未有过埋点数据时返回 null，由调用方按「从未上报」处理。</p>
	 */
	@Select("SELECT TIMESTAMPDIFF(MINUTE, MAX(create_time), NOW()) FROM landing_event " +
		"WHERE site_id = #{siteId} AND is_deleted = 0")
	Integer selectMinutesSinceLastEvent(@Param("siteId") String siteId);

	/**
	 * 区间内短链点击数（LINK_CLICKS 告警）。
	 */
	@Select("SELECT COUNT(*) FROM landing_link_click WHERE stat_day >= #{startDay} AND is_deleted = 0")
	int countLinkClicks(@Param("startDay") String startDay);

	// ---------- 导出 ----------

	@Select("SELECT e.create_time AS time, e.event_name AS event, e.path AS path, e.visitor_id AS visitorId, " +
		"e.session_id AS sessionId, e.referrer AS referrer, e.utm_source AS utmSource, " +
		"e.utm_campaign AS utmCampaign, e.device AS device, e.browser AS browser, e.os AS os, e.props AS props " +
		"FROM landing_event e WHERE e.site_id = #{siteId} AND e.stat_day >= #{startDay} AND e.is_deleted = 0 " +
		"ORDER BY e.id DESC LIMIT #{limit}")
	List<Map<String, Object>> exportEvents(@Param("siteId") String siteId,
		@Param("startDay") String startDay, @Param("limit") int limit);

	@Select("SELECT s.first_seen AS firstSeen, s.last_seen AS lastSeen, s.landing_path AS landingPath, " +
		"s.referrer AS referrer, s.utm_source AS utmSource, s.utm_medium AS utmMedium, " +
		"s.utm_campaign AS utmCampaign, s.device AS device, s.browser AS browser, s.os AS os, " +
		"s.language AS language, s.visitor_id AS visitorId " +
		"FROM landing_session s WHERE s.site_id = #{siteId} AND s.first_seen >= #{since} AND s.is_deleted = 0 " +
		"ORDER BY s.id DESC LIMIT #{limit}")
	List<Map<String, Object>> exportSessions(@Param("siteId") String siteId,
		@Param("since") java.time.LocalDateTime since, @Param("limit") int limit);

	@Select("SELECT email, status, source_path AS sourcePath, referrer, utm_source AS utmSource, " +
		"utm_medium AS utmMedium, utm_campaign AS utmCampaign, tags, create_time AS createTime " +
		"FROM landing_subscriber WHERE is_deleted = 0 ORDER BY id DESC LIMIT #{limit}")
	List<Map<String, Object>> exportSubscribers(@Param("limit") int limit);

	@Select("SELECT l.slug, l.target, l.channel, l.group_name AS groupName, l.clicks, l.enabled, " +
		"l.create_time AS createTime FROM landing_link l WHERE l.is_deleted = 0 ORDER BY l.id DESC LIMIT #{limit}")
	List<Map<String, Object>> exportLinks(@Param("limit") int limit);

	@Select("SELECT g.goal_key AS goalKey, g.name, g.step_type AS stepType, g.step_value AS stepValue, " +
		"g.enabled FROM landing_goal g WHERE g.is_deleted = 0 ORDER BY g.position, g.id")
	List<Map<String, Object>> exportGoals();

	@Select("SELECT a.create_time AS time, a.operator, a.action, a.target_type AS targetType, " +
		"a.target_key AS targetKey, a.summary, a.client_ip AS clientIp " +
		"FROM landing_ops_audit a WHERE a.is_deleted = 0 ORDER BY a.id DESC LIMIT #{limit}")
	List<Map<String, Object>> exportAudit(@Param("limit") int limit);
}
