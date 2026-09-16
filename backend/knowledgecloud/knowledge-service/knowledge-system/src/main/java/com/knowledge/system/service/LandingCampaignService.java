package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingCampaign;
import com.knowledge.system.domain.LandingCampaignSend;
import com.knowledge.system.domain.LandingSubscriber;
import com.knowledge.system.mapper.LandingCampaignMapper;
import com.knowledge.system.mapper.LandingCampaignSendMapper;
import com.knowledge.system.mapper.LandingOpsMapper;
import com.knowledge.system.mapper.LandingSubscriberMapper;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 邮件 / 触达活动（P2-2）。
 *
 * <p>活动只负责「选人群 → 渲染 → 下发 → 记录」，真正的传输交给
 * {@link LandingMailDispatcher}，默认实现只写日志，因此整条链路在没有
 * 邮件凭据的环境下也能跑通并留下投递记录。</p>
 */
@Slf4j
@Service
@AllArgsConstructor
public class LandingCampaignService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";
	public static final String DEFAULT_UNSUBSCRIBE_URL = "https://kotion.top/unsubscribe";
	/** 单次发送的收件人上限，避免一次误操作打爆邮箱通道。 */
	private static final int MAX_RECIPIENTS = 5000;
	private static final int SAMPLE_SIZE = 10;
	private static final String OPEN_PIXEL_PATH = "/api/knowledge-system/ops/campaign/open/";

	private final LandingCampaignMapper campaignMapper;
	private final LandingCampaignSendMapper campaignSendMapper;
	private final LandingOpsMapper opsMapper;
	private final LandingSubscriberMapper subscriberMapper;
	private final LandingMailDispatcher mailDispatcher;

	// ---------- 管理端 ----------

	public IPage<LandingCampaign> page(long current, long size, String status) {
		return campaignMapper.selectPage(new Page<>(current, size), Wrappers.<LandingCampaign>lambdaQuery()
			.eq(LandingCampaign::getSiteId, DEFAULT_SITE_ID)
			.eq(StrUtil.isNotBlank(status), LandingCampaign::getStatus, status)
			.orderByDesc(LandingCampaign::getId));
	}

	public LandingCampaign detail(Long id) {
		LandingCampaign row = campaignMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("活动不存在");
		}
		return row;
	}

	public Map<String, Object> create(Map<String, Object> body) {
		LandingCampaign row = new LandingCampaign();
		row.setSiteId(DEFAULT_SITE_ID);
		apply(row, body, true);
		LocalDateTime now = LocalDateTime.now();
		row.setCreateTime(now);
		row.setUpdateTime(now);
		campaignMapper.insert(row);
		return toMap(row);
	}

	public Map<String, Object> update(Long id, Map<String, Object> body) {
		LandingCampaign row = detail(id);
		apply(row, body, false);
		row.setUpdateTime(LocalDateTime.now());
		campaignMapper.updateById(row);
		return toMap(row);
	}

	public void delete(Long id) {
		campaignMapper.deleteById(id);
	}

	/**
	 * 人群预估：返回 {@code { total, sample }}。
	 *
	 * <p>带 {@code tags} 选择器时必须逐行比对订阅者的标签快照，因此
	 * 走 {@code selectAudienceRows} 并限制扫描 5000 行。</p>
	 */
	public Map<String, Object> audiencePreview(Map<String, Object> selector) {
		Map<String, Object> criteria = selector == null ? new LinkedHashMap<String, Object>() : selector;
		String status = blankToNull(StrUtil.trimToEmpty(stringValue(criteria.get("status"))));
		String utmSource = blankToNull(StrUtil.trimToEmpty(stringValue(criteria.get("utmSource"))));
		Integer days = normalizeDays(criteria.get("days"));
		LocalDateTime since = days == null ? null : LocalDateTime.now().minusDays(days);
		List<String> tags = readTags(criteria.get("tags"));

		int total;
		List<String> sample;
		if (tags.isEmpty()) {
			total = opsMapper.countAudience(status, utmSource, days, since);
			sample = opsMapper.selectAudienceSample(status, utmSource, days, since, SAMPLE_SIZE);
		} else {
			List<Map<String, Object>> rows = opsMapper.selectAudienceRows(status, utmSource, days, since, MAX_RECIPIENTS);
			List<String> matched = new ArrayList<>();
			for (Map<String, Object> row : rows) {
				if (row == null || !matchesTags(stringValue(row.get("tags")), tags)) {
					continue;
				}
				String email = stringValue(row.get("email"));
				if (!email.isEmpty()) {
					matched.add(email);
				}
			}
			total = matched.size();
			sample = new ArrayList<>(matched.subList(0, Math.min(SAMPLE_SIZE, matched.size())));
		}
		Map<String, Object> result = new LinkedHashMap<>(2);
		result.put("total", total);
		result.put("sample", sample);
		return result;
	}

	/** 给自己发一封测试邮件。 */
	public Map<String, Object> test(Long id, String email) {
		LandingCampaign campaign = detail(id);
		String to = StrUtil.trimToEmpty(email);
		if (to.isEmpty()) {
			throw new ServiceException("测试邮箱不能为空");
		}
		String html = render(campaign.getBodyHtml(), to, DEFAULT_UNSUBSCRIBE_URL + "?token=test", "test");
		boolean ok = mailDispatcher.send(to, campaign.getSubject(), html);
		Map<String, Object> result = new LinkedHashMap<>(1);
		result.put("ok", ok);
		return result;
	}

	/**
	 * 立即发送：解析人群、逐个投递并留下投递记录，最后回写活动计数。
	 *
	 * <p>整个批次在一个事务里，但每个收件人的下发都单独 try/catch，
	 * 单个失败不会中断后面的收件人。</p>
	 */
	@Transactional(rollbackFor = Exception.class)
	public Map<String, Object> send(Long id) {
		LandingCampaign campaign = detail(id);
		if ("SENDING".equalsIgnoreCase(campaign.getStatus())) {
			throw new ServiceException("活动正在发送中，请稍后再试");
		}
		List<Map<String, Object>> audience = resolveAudience(campaign);

		LocalDateTime startedAt = LocalDateTime.now();
		campaign.setStatus("SENDING");
		campaign.setStartedAt(startedAt);
		campaign.setTotalCount(audience.size());
		campaign.setSentCount(0);
		campaign.setFailedCount(0);
		campaign.setUpdateTime(startedAt);
		campaignMapper.updateById(campaign);

		int sent = 0;
		int failed = 0;
		for (Map<String, Object> recipient : audience) {
			if (recipient == null) {
				continue;
			}
			String email = stringValue(recipient.get("email"));
			if (email.isEmpty()) {
				continue;
			}
			String trackingId = UUID.randomUUID().toString().replace("-", "");
			LandingCampaignSend send = new LandingCampaignSend();
			send.setCampaignId(campaign.getId());
			send.setSubscriberId(toLong(recipient.get("id")));
			send.setEmail(StrUtil.sub(email, 0, 191));
			send.setStatus("PENDING");
			send.setTrackingId(trackingId);
			send.setStatDay(LocalDate.now());
			send.setCreateTime(startedAt);
			send.setUpdateTime(startedAt);
			campaignSendMapper.insert(send);

			String unsubscribeUrl = DEFAULT_UNSUBSCRIBE_URL + "?token=" + trackingId;
			String html = render(campaign.getBodyHtml(), email, unsubscribeUrl, trackingId);
			try {
				boolean ok = mailDispatcher.send(email, campaign.getSubject(), html);
				LocalDateTime doneAt = LocalDateTime.now();
				if (ok) {
					send.setStatus("SENT");
					send.setSentAt(doneAt);
					sent++;
				} else {
					send.setStatus("FAILED");
					send.setError("邮件通道返回失败");
					failed++;
				}
				send.setUpdateTime(doneAt);
				campaignSendMapper.updateById(send);
			} catch (Exception e) {
				LocalDateTime doneAt = LocalDateTime.now();
				String reason = StrUtil.isBlank(e.getMessage()) ? e.getClass().getSimpleName() : e.getMessage();
				send.setStatus("FAILED");
				send.setError(StrUtil.sub(reason, 0, 512));
				send.setUpdateTime(doneAt);
				campaignSendMapper.updateById(send);
				failed++;
				log.warn("活动邮件下发失败: campaign={}, email={}", campaign.getId(), email, e);
			}
		}

		LocalDateTime finishedAt = LocalDateTime.now();
		campaign.setSentCount(sent);
		campaign.setFailedCount(failed);
		campaign.setFinishedAt(finishedAt);
		campaign.setStatus(sent == 0 && failed > 0 ? "FAILED" : "SENT");
		campaign.setUpdateTime(finishedAt);
		campaignMapper.updateById(campaign);

		Map<String, Object> result = new LinkedHashMap<>(1);
		result.put("queued", audience.size());
		return result;
	}

	public IPage<LandingCampaignSend> sends(Long campaignId, long current, long size, String status) {
		return campaignSendMapper.selectPage(new Page<>(current, size), Wrappers.<LandingCampaignSend>lambdaQuery()
			.eq(LandingCampaignSend::getCampaignId, campaignId)
			.eq(StrUtil.isNotBlank(status), LandingCampaignSend::getStatus, status)
			.orderByDesc(LandingCampaignSend::getId));
	}

	/**
	 * 打开像素回调：只有首次打开写入 openedAt，并给活动 openCount +1。
	 */
	@Transactional(rollbackFor = Exception.class)
	public void trackOpen(String trackingId) {
		LandingCampaignSend send = findSend(trackingId);
		if (send == null) {
			return;
		}
		if (send.getOpenedAt() != null) {
			return;
		}
		LocalDateTime now = LocalDateTime.now();
		send.setOpenedAt(now);
		if ("SENT".equalsIgnoreCase(send.getStatus())) {
			send.setStatus("OPENED");
		}
		send.setUpdateTime(now);
		campaignSendMapper.updateById(send);
		bumpCounter(send.getCampaignId(), "openCount");
	}

	/**
	 * 点击回调：首次点击写 clickedAt 并给活动 clickCount +1；
	 * 状态只在 SENT / OPENED 时升级为 CLICKED，不降级已有状态。
	 */
	@Transactional(rollbackFor = Exception.class)
	public void trackClick(String trackingId) {
		LandingCampaignSend send = findSend(trackingId);
		if (send == null) {
			return;
		}
		LocalDateTime now = LocalDateTime.now();
		boolean firstClick = send.getClickedAt() == null;
		if (firstClick) {
			send.setClickedAt(now);
		}
		String status = StrUtil.trimToEmpty(send.getStatus()).toUpperCase();
		if ("SENT".equals(status) || "OPENED".equals(status)) {
			send.setStatus("CLICKED");
		}
		send.setUpdateTime(now);
		campaignSendMapper.updateById(send);
		if (firstClick) {
			bumpCounter(send.getCampaignId(), "clickCount");
		}
	}

	/**
	 * 退订：token 既可能是订阅者的 unsubscribe_token，也可能是投递记录的 trackingId
	 * （链接里带追踪 id 时）。命中后置为退订并累加活动退订数。
	 */
	@Transactional(rollbackFor = Exception.class)
	public String unsubscribe(String token) {
		String value = StrUtil.trimToEmpty(token);
		if (value.isEmpty()) {
			return "退订链接无效或已使用";
		}
		LandingSubscriber subscriber = subscriberMapper.selectOne(Wrappers.<LandingSubscriber>lambdaQuery()
			.eq(LandingSubscriber::getUnsubscribeToken, value)
			.last("LIMIT 1"));
		LandingCampaignSend send = campaignSendMapper.selectOne(Wrappers.<LandingCampaignSend>lambdaQuery()
			.eq(LandingCampaignSend::getTrackingId, value)
			.last("LIMIT 1"));
		if (subscriber == null && send != null && send.getSubscriberId() != null) {
			subscriber = subscriberMapper.selectById(send.getSubscriberId());
		}
		if (subscriber == null && send == null) {
			return "退订链接无效或已使用";
		}
		LocalDateTime now = LocalDateTime.now();
		if (subscriber != null) {
			subscriber.setStatus("unsubscribed");
			subscriber.setUpdateTime(now);
			subscriberMapper.updateById(subscriber);
		}
		if (send != null && !"UNSUBSCRIBED".equalsIgnoreCase(send.getStatus())) {
			send.setStatus("UNSUBSCRIBED");
			send.setUpdateTime(now);
			campaignSendMapper.updateById(send);
			bumpCounter(send.getCampaignId(), "unsubscribeCount");
		}
		return "退订成功，后续将不再收到此类邮件";
	}

	/**
	 * 模板渲染：替换 {@code {{email}}} / {@code {{unsubscribe_url}}} /
	 * {@code {{tracking_id}}} / {@code {{open_pixel}}}。
	 */
	public String render(String html, String email, String unsubscribeUrl, String trackingId) {
		String body = html == null ? "" : html;
		if (StrUtil.isBlank(body)) {
			body = "<p>感谢关注 Kotion。</p>";
		}
		String pixel = "<img src=\"" + OPEN_PIXEL_PATH + safe(trackingId)
			+ "\" width=\"1\" height=\"1\" alt=\"\" style=\"display:none\" />";
		body = body.replace("{{email}}", safe(email));
		body = body.replace("{{unsubscribe_url}}", safe(unsubscribeUrl));
		body = body.replace("{{tracking_id}}", safe(trackingId));
		body = body.replace("{{open_pixel}}", pixel);
		return body;
	}

	// ---------- 内部 ----------

	private LandingCampaignSend findSend(String trackingId) {
		if (StrUtil.isBlank(trackingId)) {
			return null;
		}
		return campaignSendMapper.selectOne(Wrappers.<LandingCampaignSend>lambdaQuery()
			.eq(LandingCampaignSend::getTrackingId, trackingId.trim())
			.last("LIMIT 1"));
	}

	private void bumpCounter(Long campaignId, String field) {
		if (campaignId == null) {
			return;
		}
		LandingCampaign campaign = campaignMapper.selectById(campaignId);
		if (campaign == null) {
			return;
		}
		if ("openCount".equals(field)) {
			campaign.setOpenCount(intValue(campaign.getOpenCount()) + 1);
		} else if ("clickCount".equals(field)) {
			campaign.setClickCount(intValue(campaign.getClickCount()) + 1);
		} else {
			campaign.setUnsubscribeCount(intValue(campaign.getUnsubscribeCount()) + 1);
		}
		campaign.setUpdateTime(LocalDateTime.now());
		campaignMapper.updateById(campaign);
	}

	/** 解析活动受众选择器并落到收件人列表（最多 {@value #MAX_RECIPIENTS} 人）。 */
	private List<Map<String, Object>> resolveAudience(LandingCampaign campaign) {
		Map<String, Object> selector = parseAudience(campaign.getAudience());
		String status = blankToNull(StrUtil.trimToEmpty(stringValue(selector.get("status"))));
		String utmSource = blankToNull(StrUtil.trimToEmpty(stringValue(selector.get("utmSource"))));
		Integer days = normalizeDays(selector.get("days"));
		LocalDateTime since = days == null ? null : LocalDateTime.now().minusDays(days);
		List<Map<String, Object>> rows = opsMapper.selectAudienceRows(status, utmSource, days, since, MAX_RECIPIENTS);
		List<String> tags = readTags(selector.get("tags"));
		if (tags.isEmpty()) {
			return rows;
		}
		List<Map<String, Object>> filtered = new ArrayList<>();
		for (Map<String, Object> row : rows) {
			if (row != null && matchesTags(stringValue(row.get("tags")), tags)) {
				filtered.add(row);
			}
		}
		return filtered;
	}

	private Map<String, Object> parseAudience(String json) {
		Map<String, Object> map = new LinkedHashMap<>();
		if (StrUtil.isBlank(json)) {
			return map;
		}
		try {
			JSONObject object = JSONUtil.parseObj(json);
			for (Map.Entry<String, Object> entry : object.entrySet()) {
				map.put(entry.getKey(), entry.getValue());
			}
		} catch (Exception e) {
			// 存储损坏时按「全部人群」处理，避免活动彻底无法发送
		}
		return map;
	}

	/** 标签选择器：字符串数组；也兼容逗号分隔字符串。 */
	private static List<String> readTags(Object raw) {
		List<String> tags = new ArrayList<>();
		if (raw instanceof List) {
			for (Object item : (List<?>) raw) {
				addTag(tags, item == null ? null : String.valueOf(item));
			}
		} else if (raw instanceof String) {
			for (String part : ((String) raw).split(",")) {
				addTag(tags, part);
			}
		}
		return tags;
	}

	private static void addTag(List<String> tags, String raw) {
		String tag = StrUtil.trimToEmpty(raw);
		if (!tag.isEmpty() && !tags.contains(tag)) {
			tags.add(tag);
		}
	}

	/** 标签快照为逗号分隔文本，这里做大小写不敏感的包含匹配。 */
	private static boolean matchesTags(String column, List<String> wanted) {
		if (StrUtil.isBlank(column)) {
			return false;
		}
		String lower = column.toLowerCase();
		for (String tag : wanted) {
			if (lower.contains(tag.toLowerCase())) {
				return true;
			}
		}
		return false;
	}

	private static Integer normalizeDays(Object value) {
		int days = intValue(value, 0);
		return days > 0 ? days : null;
	}

	private static String blankToNull(String value) {
		return StrUtil.isBlank(value) ? null : value;
	}

	private static String safe(String value) {
		return value == null ? "" : value;
	}

	private Map<String, Object> toMap(LandingCampaign row) {
		Map<String, Object> item = new LinkedHashMap<>(20);
		item.put("id", row.getId());
		item.put("name", row.getName());
		item.put("subject", row.getSubject());
		item.put("preheader", row.getPreheader());
		item.put("templateKey", row.getTemplateKey());
		item.put("bodyHtml", row.getBodyHtml());
		item.put("audience", parseAudience(row.getAudience()));
		item.put("status", row.getStatus());
		item.put("scheduledAt", row.getScheduledAt());
		item.put("startedAt", row.getStartedAt());
		item.put("finishedAt", row.getFinishedAt());
		item.put("totalCount", row.getTotalCount());
		item.put("sentCount", row.getSentCount());
		item.put("failedCount", row.getFailedCount());
		item.put("openCount", row.getOpenCount());
		item.put("clickCount", row.getClickCount());
		item.put("unsubscribeCount", row.getUnsubscribeCount());
		item.put("testEmail", row.getTestEmail());
		item.put("createTime", row.getCreateTime());
		item.put("updateTime", row.getUpdateTime());
		return item;
	}

	private void apply(LandingCampaign row, Map<String, Object> body, boolean creating) {
		Map<String, Object> payload = body == null ? new LinkedHashMap<String, Object>() : body;
		if (payload.get("name") != null) {
			row.setName(StrUtil.sub(stringValue(payload.get("name")), 0, 128));
		}
		if (payload.get("subject") != null) {
			row.setSubject(StrUtil.sub(stringValue(payload.get("subject")), 0, 255));
		}
		if (payload.get("preheader") != null) {
			row.setPreheader(StrUtil.sub(stringValue(payload.get("preheader")), 0, 255));
		}
		if (payload.get("templateKey") != null) {
			row.setTemplateKey(StrUtil.sub(stringValue(payload.get("templateKey")), 0, 191));
		}
		if (payload.get("bodyHtml") != null) {
			row.setBodyHtml(stringValue(payload.get("bodyHtml")));
		}
		if (payload.get("audience") != null) {
			Object audience = payload.get("audience");
			row.setAudience(audience instanceof String ? (String) audience : JSONUtil.toJsonStr(audience));
		}
		if (creating || payload.get("status") != null) {
			row.setStatus(normalizeStatus(stringValue(payload.get("status"))));
		}
		if (payload.get("scheduledAt") != null) {
			row.setScheduledAt(parseDateTime(payload.get("scheduledAt")));
		}
		if (payload.get("testEmail") != null) {
			row.setTestEmail(StrUtil.sub(stringValue(payload.get("testEmail")), 0, 191));
		}
		row.setSiteId(DEFAULT_SITE_ID);
		if (creating) {
			// 计数只由发送流程维护，客户端不可直接写。
			row.setTotalCount(0);
			row.setSentCount(0);
			row.setFailedCount(0);
			row.setOpenCount(0);
			row.setClickCount(0);
			row.setUnsubscribeCount(0);
		}
		if (StrUtil.isBlank(row.getName())) {
			throw new ServiceException("活动名称不能为空");
		}
		if (StrUtil.isBlank(row.getSubject())) {
			throw new ServiceException("邮件主题不能为空");
		}
	}

	private static String normalizeStatus(String raw) {
		String value = StrUtil.trimToEmpty(raw).toUpperCase();
		if ("SCHEDULED".equals(value) || "SENDING".equals(value) || "SENT".equals(value)
			|| "FAILED".equals(value) || "CANCELLED".equals(value)) {
			return value;
		}
		return "DRAFT";
	}

	private static LocalDateTime parseDateTime(Object value) {
		String text = StrUtil.trimToEmpty(stringValue(value));
		if (text.isEmpty()) {
			return null;
		}
		try {
			return LocalDateTime.parse(text.replace("Z", "").replace(" ", "T"));
		} catch (Exception e) {
			try {
				return LocalDateTime.parse(text.substring(0, Math.min(text.length(), 19)));
			} catch (Exception ignored) {
				return null;
			}
		}
	}

	private static Long toLong(Object value) {
		if (value == null) {
			return null;
		}
		if (value instanceof Number) {
			return ((Number) value).longValue();
		}
		try {
			return Long.valueOf(String.valueOf(value).trim());
		} catch (NumberFormatException e) {
			return null;
		}
	}

	private static int intValue(Object value) {
		return intValue(value, 0);
	}

	private static int intValue(Object value, int fallback) {
		if (value == null) {
			return fallback;
		}
		if (value instanceof Number) {
			return ((Number) value).intValue();
		}
		try {
			return Integer.parseInt(String.valueOf(value).trim());
		} catch (NumberFormatException e) {
			return fallback;
		}
	}

	private static String stringValue(Object value) {
		return value == null ? "" : String.valueOf(value);
	}
}
