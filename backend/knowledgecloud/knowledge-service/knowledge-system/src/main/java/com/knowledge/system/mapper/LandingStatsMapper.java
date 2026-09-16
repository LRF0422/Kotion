package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.knowledge.system.domain.vo.LandingBreakdownVO;
import com.knowledge.system.domain.vo.LandingChannelVO;
import com.knowledge.system.domain.vo.LandingDailyTrendVO;
import com.knowledge.system.domain.vo.LandingEventRankVO;
import com.knowledge.system.domain.vo.LandingFunnelEventVO;
import com.knowledge.system.domain.vo.LandingOverviewVO;
import com.knowledge.system.domain.vo.LandingPageRankVO;
import com.knowledge.system.domain.vo.LandingPropCountVO;
import com.knowledge.system.domain.vo.LandingReferrerVO;
import com.knowledge.system.domain.vo.LandingSessionStatsVO;
import com.knowledge.system.domain.vo.LandingSessionVO;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 落地页运营统计 Mapper
 *
 * <p>全局维度聚合，忽略租户行拦截器。</p>
 */
@InterceptorIgnore(tenantLine = "true")
public interface LandingStatsMapper {

	/**
	 * 区间内总量（浏览量/事件数/访客数/会话数）
	 */
	@Select("SELECT " +
		"SUM(CASE WHEN event_name = 'pageview' THEN 1 ELSE 0 END) AS pageviews, " +
		"SUM(CASE WHEN event_name <> 'pageview' THEN 1 ELSE 0 END) AS events, " +
		"COUNT(DISTINCT visitor_id) AS visitors, " +
		"COUNT(DISTINCT session_id) AS sessions " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND stat_day >= #{startDay} AND is_deleted = 0")
	LandingOverviewVO selectTotals(@Param("siteId") String siteId, @Param("startDay") String startDay);

	/**
	 * 跳出数与会话平均时长（秒）
	 */
	@Select("SELECT " +
		"SUM(CASE WHEN t.pv <= 1 THEN 1 ELSE 0 END) AS bounces, " +
		"AVG(t.duration) AS avgDurationMs " +
		"FROM ( " +
		"  SELECT session_id, " +
		"         TIMESTAMPDIFF(SECOND, MIN(create_time), MAX(create_time)) AS duration, " +
		"         SUM(CASE WHEN event_name = 'pageview' THEN 1 ELSE 0 END) AS pv " +
		"  FROM landing_event " +
		"  WHERE site_id = #{siteId} AND stat_day >= #{startDay} AND is_deleted = 0 " +
		"  GROUP BY session_id " +
		") t")
	LandingSessionStatsVO selectSessionStats(@Param("siteId") String siteId, @Param("startDay") String startDay);

	/**
	 * 区间内新增访客（按会话首次出现）
	 */
	@Select("SELECT COUNT(*) FROM landing_session " +
		"WHERE site_id = #{siteId} AND first_seen >= #{since} AND is_deleted = 0")
	Long selectNewVisitors(@Param("siteId") String siteId, @Param("since") LocalDateTime since);

	/**
	 * 按天趋势
	 */
	@Select("SELECT DATE_FORMAT(stat_day, '%Y-%m-%d') AS date, " +
		"SUM(CASE WHEN event_name = 'pageview' THEN 1 ELSE 0 END) AS pageviews, " +
		"SUM(CASE WHEN event_name <> 'pageview' THEN 1 ELSE 0 END) AS events, " +
		"COUNT(DISTINCT visitor_id) AS visitors, " +
		"COUNT(DISTINCT session_id) AS sessions " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND stat_day >= #{startDay} AND is_deleted = 0 " +
		"GROUP BY stat_day ORDER BY stat_day")
	List<LandingDailyTrendVO> selectDailyTrend(@Param("siteId") String siteId, @Param("startDay") String startDay);

	/**
	 * 页面浏览量排行
	 */
	@Select("SELECT path, COUNT(*) AS pageviews, COUNT(DISTINCT visitor_id) AS visitors " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND stat_day >= #{startDay} AND event_name = 'pageview' " +
		"AND path IS NOT NULL AND is_deleted = 0 " +
		"GROUP BY path ORDER BY pageviews DESC LIMIT #{limit}")
	List<LandingPageRankVO> selectTopPages(@Param("siteId") String siteId, @Param("startDay") String startDay,
		@Param("limit") int limit);

	/**
	 * 自定义事件排行
	 */
	@Select("SELECT event_name AS name, COUNT(*) AS `count`, COUNT(DISTINCT visitor_id) AS visitors " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND stat_day >= #{startDay} AND event_name <> 'pageview' AND is_deleted = 0 " +
		"GROUP BY event_name ORDER BY `count` DESC LIMIT #{limit}")
	List<LandingEventRankVO> selectTopEvents(@Param("siteId") String siteId, @Param("startDay") String startDay,
		@Param("limit") int limit);

	/**
	 * 渠道归因（UTM 优先，缺失归为 direct）
	 */
	@Select("SELECT COALESCE(NULLIF(utm_source, ''), 'direct') AS source, " +
		"COALESCE(NULLIF(utm_medium, ''), '-') AS medium, " +
		"COALESCE(NULLIF(utm_campaign, ''), '-') AS campaign, " +
		"COUNT(DISTINCT visitor_id) AS visitors, " +
		"COUNT(DISTINCT session_id) AS sessions, " +
		"SUM(CASE WHEN event_name = 'pageview' THEN 1 ELSE 0 END) AS pageviews " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND stat_day >= #{startDay} AND is_deleted = 0 " +
		"GROUP BY source, medium, campaign ORDER BY visitors DESC LIMIT #{limit}")
	List<LandingChannelVO> selectChannels(@Param("siteId") String siteId, @Param("startDay") String startDay,
		@Param("limit") int limit);

	/**
	 * 外部来源排行
	 */
	@Select("SELECT COALESCE(NULLIF(referrer, ''), '(direct)') AS referrer, " +
		"COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS pageviews " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND stat_day >= #{startDay} AND event_name = 'pageview' AND is_deleted = 0 " +
		"GROUP BY referrer ORDER BY visitors DESC LIMIT #{limit}")
	List<LandingReferrerVO> selectReferrers(@Param("siteId") String siteId, @Param("startDay") String startDay,
		@Param("limit") int limit);

	/**
	 * 单维度分布（device/browser/os，列名由服务层白名单控制）
	 */
	@Select("SELECT COALESCE(NULLIF(${column}, ''), 'unknown') AS label, " +
		"COUNT(DISTINCT visitor_id) AS visitors " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND stat_day >= #{startDay} AND is_deleted = 0 " +
		"GROUP BY label ORDER BY visitors DESC")
	List<LandingBreakdownVO> selectBreakdown(@Param("siteId") String siteId, @Param("startDay") String startDay,
		@Param("column") String column);

	/**
	 * 事件属性分布（props JSON 中的某个键）
	 */
	@Select("SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(props, #{jsonPath})), '(none)') AS label, " +
		"COUNT(*) AS `count`, COUNT(DISTINCT visitor_id) AS visitors " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND stat_day >= #{startDay} AND event_name = #{eventName} " +
		"AND props IS NOT NULL AND is_deleted = 0 " +
		"GROUP BY label ORDER BY `count` DESC LIMIT #{limit}")
	List<LandingPropCountVO> selectEventProps(@Param("siteId") String siteId, @Param("startDay") String startDay,
		@Param("eventName") String eventName, @Param("jsonPath") String jsonPath, @Param("limit") int limit);

	/**
	 * 实时概览（按创建时间滑动窗口）
	 */
	@Select("SELECT " +
		"COUNT(DISTINCT visitor_id) AS visitors, " +
		"COUNT(DISTINCT session_id) AS sessions, " +
		"SUM(CASE WHEN event_name = 'pageview' THEN 1 ELSE 0 END) AS pageviews " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND create_time >= #{since} AND is_deleted = 0")
	LandingOverviewVO selectRealtime(@Param("siteId") String siteId, @Param("since") LocalDateTime since);

	/**
	 * 实时页面排行
	 */
	@Select("SELECT path, COUNT(*) AS pageviews, COUNT(DISTINCT visitor_id) AS visitors " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND create_time >= #{since} AND event_name = 'pageview' " +
		"AND path IS NOT NULL AND is_deleted = 0 " +
		"GROUP BY path ORDER BY pageviews DESC LIMIT #{limit}")
	List<LandingPageRankVO> selectRealtimePages(@Param("siteId") String siteId, @Param("since") LocalDateTime since,
		@Param("limit") int limit);

	/**
	 * 拉取漏斗候选事件（按会话、时间排序，由服务层按步骤顺序计算）
	 */
	@Select({"<script>",
		"SELECT session_id AS sessionId, visitor_id AS visitorId, event_name AS eventName, path, create_time AS createTime " +
			"FROM landing_event " +
			"WHERE site_id = #{siteId} AND stat_day >= #{startDay} AND is_deleted = 0 AND (",
		"<if test='eventNames != null and eventNames.size() > 0'> event_name IN " +
			"<foreach collection='eventNames' item='n' open='(' separator=',' close=')'>#{n}</foreach> </if>",
		"<if test='eventNames != null and eventNames.size() > 0 and paths != null and paths.size() > 0'> OR </if>",
		"<if test='paths != null and paths.size() > 0'> path IN " +
			"<foreach collection='paths' item='p' open='(' separator=',' close=')'>#{p}</foreach> </if>",
		") ORDER BY session_id, create_time",
		"</script>"})
	List<LandingFunnelEventVO> selectFunnelEvents(@Param("siteId") String siteId, @Param("startDay") String startDay,
		@Param("eventNames") List<String> eventNames, @Param("paths") List<String> paths);

	/**
	 * 最近会话明细
	 */
	@Select("SELECT s.id, s.visitor_id AS visitorId, s.landing_path AS landingPath, s.referrer, " +
		"s.utm_source AS utmSource, s.utm_medium AS utmMedium, s.utm_campaign AS utmCampaign, " +
		"s.device, s.browser, s.os, s.language, s.first_seen AS firstSeen, s.last_seen AS lastSeen, " +
		"(SELECT COUNT(*) FROM landing_event e WHERE e.session_id = s.session_key " +
		"  AND e.event_name = 'pageview' AND e.is_deleted = 0) AS pageviews, " +
		"(SELECT COUNT(*) FROM landing_event e WHERE e.session_id = s.session_key " +
		"  AND e.event_name <> 'pageview' AND e.is_deleted = 0) AS events " +
		"FROM landing_session s " +
		"WHERE s.site_id = #{siteId} AND s.is_deleted = 0 " +
		"ORDER BY s.last_seen DESC LIMIT #{limit}")
	List<LandingSessionVO> selectRecentSessions(@Param("siteId") String siteId, @Param("limit") int limit);
}
