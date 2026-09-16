package com.knowledge.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.knowledge.system.domain.LandingSession;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

/**
 * 落地页会话 Mapper
 *
 * <p>会话按 session_key 幂等 upsert：重复上报只推进 last_seen，保留首次归因信息。</p>
 */
public interface LandingSessionMapper extends BaseMapper<LandingSession> {

	/**
	 * 幂等写入会话；已存在时仅更新 last_seen（不覆盖首次归因）。
	 */
	@Insert("INSERT INTO landing_session (site_id, session_key, visitor_id, first_seen, last_seen, landing_path, referrer, " +
		"utm_source, utm_medium, utm_campaign, utm_content, utm_term, device, browser, os, country, language, " +
		"create_time, update_time, is_deleted) " +
		"VALUES (#{siteId}, #{sessionKey}, #{visitorId}, #{firstSeen}, #{lastSeen}, #{landingPath}, #{referrer}, " +
		"#{utmSource}, #{utmMedium}, #{utmCampaign}, #{utmContent}, #{utmTerm}, #{device}, #{browser}, #{os}, #{country}, #{language}, " +
		"#{firstSeen}, #{lastSeen}, 0) " +
		"ON DUPLICATE KEY UPDATE last_seen = VALUES(last_seen), update_time = VALUES(last_seen)")
	int upsertSession(LandingSession session);
}
