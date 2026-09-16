package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.knowledge.system.domain.LandingEvent;
import com.knowledge.system.domain.LandingSession;
import com.knowledge.system.domain.dto.LandingCollectDTO;
import com.knowledge.system.domain.dto.LandingEventDTO;
import com.knowledge.system.mapper.LandingEventMapper;
import com.knowledge.system.mapper.LandingSessionMapper;
import com.knowledge.system.util.LandingUserAgent;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 落地页埋点采集服务
 */
@Service
@AllArgsConstructor
public class LandingCollectService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";
	private static final int MAX_EVENTS_PER_BATCH = 40;
	private static final int MAX_TEXT = 512;

	private final LandingEventMapper landingEventMapper;
	private final LandingSessionMapper landingSessionMapper;

	/**
	 * 批量采集埋点。返回实际写入的事件数。
	 */
	@Transactional(rollbackFor = Exception.class)
	public int collect(LandingCollectDTO dto, String userAgent, String clientIp) {
		List<LandingEventDTO> events = dto.getEvents() == null ? Collections.emptyList() : dto.getEvents();
		List<LandingEvent> rows = new ArrayList<>();
		if (events.isEmpty()) {
			return 0;
		}

		String siteId = StrUtil.blankToDefault(dto.getSiteId(), DEFAULT_SITE_ID);
		String sessionKey = StrUtil.blankToDefault(dto.getSessionId(), UUID.randomUUID().toString().replace("-", ""));
		String visitorId = StrUtil.blankToDefault(dto.getVisitorId(), sessionKey);
		Map<String, String> utm = dto.getUtm() == null ? Collections.emptyMap() : dto.getUtm();
		String device = LandingUserAgent.device(userAgent);
		String browser = LandingUserAgent.browser(userAgent);
		String os = LandingUserAgent.os(userAgent);
		LocalDateTime now = LocalDateTime.now();
		LocalDate statDay = now.toLocalDate();

		LandingEventDTO first = events.get(0);
		LandingSession session = new LandingSession();
		session.setSiteId(siteId);
		session.setSessionKey(sessionKey);
		session.setVisitorId(visitorId);
		session.setFirstSeen(now);
		session.setLastSeen(now);
		session.setLandingPath(trim(first.getPath(), 255));
		session.setReferrer(trim(StrUtil.blankToDefault(dto.getReferrer(), first.getReferrer()), MAX_TEXT));
		session.setUtmSource(trim(utm.get("source"), 128));
		session.setUtmMedium(trim(utm.get("medium"), 128));
		session.setUtmCampaign(trim(utm.get("campaign"), 128));
		session.setUtmContent(trim(utm.get("content"), 128));
		session.setUtmTerm(trim(utm.get("term"), 128));
		session.setDevice(device);
		session.setBrowser(browser);
		session.setOs(os);
		session.setLanguage(trim(dto.getLanguage(), 32));
		landingSessionMapper.upsertSession(session);

		int count = 0;
		for (LandingEventDTO event : events) {
			if (event == null || StrUtil.isBlank(event.getName())) {
				continue;
			}
			LandingEvent row = new LandingEvent();
			row.setSiteId(siteId);
			row.setSessionId(sessionKey);
			row.setVisitorId(visitorId);
			row.setEventName(trim(event.getName(), 64));
			row.setPath(trim(event.getPath(), 255));
			row.setTitle(trim(event.getTitle(), 255));
			row.setReferrer(trim(StrUtil.blankToDefault(event.getReferrer(), dto.getReferrer()), MAX_TEXT));
			row.setProps(event.getProps() == null ? null : trim(JSONUtil.toJsonStr(event.getProps()), 4096));
			row.setUtmSource(trim(utm.get("source"), 128));
			row.setUtmMedium(trim(utm.get("medium"), 128));
			row.setUtmCampaign(trim(utm.get("campaign"), 128));
			row.setUtmContent(trim(utm.get("content"), 128));
			row.setUtmTerm(trim(utm.get("term"), 128));
			row.setDevice(device);
			row.setBrowser(browser);
			row.setOs(os);
			row.setLanguage(trim(dto.getLanguage(), 32));
			row.setStatDay(statDay);
			row.setCreateTime(now);
			row.setUpdateTime(now);
			rows.add(row);
			count++;
			if (rows.size() >= MAX_EVENTS_PER_BATCH) {
				break;
			}
		}
		if (!rows.isEmpty()) {
			landingEventMapper.insertBatch(rows);
		}
		return count;
	}

	private static String trim(String value, int max) {
		if (value == null) {
			return null;
		}
		return value.length() > max ? value.substring(0, max) : value;
	}
}
