package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.system.domain.LandingEvent;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 落地页埋点事件 Mapper
 */
public interface LandingEventMapper extends BaseMapper<LandingEvent> {

	/**
	 * 批量写入埋点事件（自定义插入，不依赖自动填充，createTime 由调用方显式设置）。
	 */
	@Insert("<script>" +
		"INSERT INTO landing_event (site_id, session_id, visitor_id, event_name, path, title, referrer, props, " +
		"utm_source, utm_medium, utm_campaign, utm_content, utm_term, device, browser, os, country, language, " +
		"stat_day, create_time, update_time, is_deleted) VALUES " +
		"<foreach collection='list' item='e' separator=','>" +
		"(#{e.siteId}, #{e.sessionId}, #{e.visitorId}, #{e.eventName}, #{e.path}, #{e.title}, #{e.referrer}, #{e.props}, " +
		"#{e.utmSource}, #{e.utmMedium}, #{e.utmCampaign}, #{e.utmContent}, #{e.utmTerm}, " +
		"#{e.device}, #{e.browser}, #{e.os}, #{e.country}, #{e.language}, " +
		"#{e.statDay}, #{e.createTime}, #{e.updateTime}, 0)" +
		"</foreach>" +
		"</script>")
	int insertBatch(@Param("list") List<LandingEvent> list);
}
