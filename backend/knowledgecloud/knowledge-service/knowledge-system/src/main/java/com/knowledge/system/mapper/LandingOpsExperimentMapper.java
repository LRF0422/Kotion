package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 实验结果的「事件来源」查询。
 *
 * <p>实验曝光/转化有两条上报路径：</p>
 * <ol>
 *   <li>埋点管道：`landing_event` 中的 `experiment_exposure` / `experiment_conversion`
 *       事件（props 内带 experiment / variant）；</li>
 *   <li>显式接口：`landing_experiment_exposure` 表（`POST /ops/exposure`，
 *       对 (site, exp, visitor) 唯一）。</li>
 * </ol>
 *
 * <p>两条路径都可能被启用，因此结果取两者的较大值而不是相加，
 * 避免同一批访客被重复计数。</p>
 */
@InterceptorIgnore(tenantLine = "true")
public interface LandingOpsExperimentMapper {

	/**
	 * 从埋点事件推导曝光数（按变体去重访客）。
	 */
	@Select("SELECT JSON_UNQUOTE(JSON_EXTRACT(props, '$.variant')) AS variantKey, " +
		"COUNT(DISTINCT visitor_id) AS exposures " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND event_name = 'experiment_exposure' " +
		"AND stat_day >= #{startDay} AND is_deleted = 0 " +
		"AND JSON_UNQUOTE(JSON_EXTRACT(props, '$.experiment')) = #{expKey} " +
		"GROUP BY variantKey")
	List<Map<String, Object>> selectExposuresFromEvents(@Param("siteId") String siteId,
		@Param("expKey") String expKey,
		@Param("startDay") String startDay);

	/**
	 * 从埋点事件推导转化数（按变体去重访客）。
	 *
	 * <p>落地页 `reportExperimentConversion()` 上报 `experiment_conversion`，
	 * props 内带 experiment / variant / metric。</p>
	 */
	@Select("SELECT JSON_UNQUOTE(JSON_EXTRACT(props, '$.variant')) AS variantKey, " +
		"COUNT(DISTINCT visitor_id) AS conversions " +
		"FROM landing_event " +
		"WHERE site_id = #{siteId} AND event_name = 'experiment_conversion' " +
		"AND stat_day >= #{startDay} AND is_deleted = 0 " +
		"AND JSON_UNQUOTE(JSON_EXTRACT(props, '$.experiment')) = #{expKey} " +
		"GROUP BY variantKey")
	List<Map<String, Object>> selectConversionsFromEvents(@Param("siteId") String siteId,
		@Param("expKey") String expKey,
		@Param("startDay") String startDay);
}
