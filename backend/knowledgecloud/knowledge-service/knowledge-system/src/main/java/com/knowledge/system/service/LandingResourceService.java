package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingResource;
import com.knowledge.system.mapper.LandingResourceMapper;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 落地页通用配置资源（P1）。
 *
 * <p>SEO / 区块编排 / 推广位 / 素材 / 精选位 / 投放页 / 邮件模板都落在
 * {@code landing_resource}，靠 {@code res_kind} 区分。这样后台的编辑体验统一，
 * 也避免为每种内容形态建一张表。</p>
 *
 * <p>数据库里 `payload` 是 JSON 文本，对外统一返回解析后的对象。</p>
 */
@Service
@AllArgsConstructor
public class LandingResourceService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";

	private static final List<String> KINDS = java.util.Arrays.asList(
		"SEO", "SECTION", "PROMOTION", "ASSET", "NAV", "FEATURED",
		"EMAIL_TEMPLATE", "AUDIENCE", "ALERT_RULE", "CAMPAIGN_PAGE");

	private final LandingResourceMapper resourceMapper;

	public List<Map<String, Object>> list(String kind, String locale, String status) {
		requireKind(kind);
		List<LandingResource> rows = resourceMapper.selectList(Wrappers.<LandingResource>lambdaQuery()
			.eq(LandingResource::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingResource::getResKind, kind.toUpperCase())
			.eq(StrUtil.isNotBlank(locale), LandingResource::getLocale, locale)
			.eq(StrUtil.isNotBlank(status), LandingResource::getStatus, status)
			.orderByAsc(LandingResource::getPosition)
			.orderByAsc(LandingResource::getId));
		List<Map<String, Object>> result = new ArrayList<>(rows.size());
		for (LandingResource row : rows) {
			result.add(toMap(row));
		}
		return result;
	}

	public Map<String, Object> detail(String kind, String key, String locale) {
		requireKind(kind);
		LandingResource row = find(kind, key, locale);
		if (row == null) {
			throw new ServiceException("配置不存在：" + kind + "/" + key);
		}
		return toMap(row);
	}

	@Transactional(rollbackFor = Exception.class)
	public Map<String, Object> save(String kind, String key, Map<String, Object> body) {
		requireKind(kind);
		String locale = StrUtil.blankToDefault(stringValue(body.get("locale")), "zh");
		LandingResource row = find(kind, key, locale);
		boolean creating = row == null;
		if (creating) {
			row = new LandingResource();
			row.setSiteId(DEFAULT_SITE_ID);
			row.setResKind(kind.toUpperCase());
			row.setResKey(StrUtil.sub(key, 0, 191));
			row.setLocale(locale);
			row.setCreateTime(LocalDateTime.now());
		}
		if (body.get("payload") != null) {
			Object payload = body.get("payload");
			row.setPayload(payload instanceof String ? (String) payload : JSONUtil.toJsonStr(payload));
		} else if (creating) {
			row.setPayload("{}");
		}
		row.setStatus(normalizeStatus(body.get("status"), creating));
		row.setEnabled(body.get("enabled") == null ? Boolean.TRUE : Boolean.valueOf(stringValue(body.get("enabled"))));
		row.setPosition(body.get("position") == null ? 0 : Integer.valueOf(stringValue(body.get("position"))));
		row.setStartTime(parseDateTime(body.get("startTime")));
		row.setEndTime(parseDateTime(body.get("endTime")));
		if (body.get("remark") != null) {
			row.setRemark(StrUtil.sub(stringValue(body.get("remark")), 0, 255));
		}
		row.setUpdateTime(LocalDateTime.now());
		if (creating) {
			resourceMapper.insert(row);
		} else {
			resourceMapper.updateById(row);
		}
		return toMap(row);
	}

	@Transactional(rollbackFor = Exception.class)
	public int batchSave(String kind, List<Map<String, Object>> items) {
		requireKind(kind);
		if (items == null || items.isEmpty()) {
			return 0;
		}
		int count = 0;
		for (int i = 0; i < items.size(); i++) {
			Map<String, Object> item = items.get(i);
			if (item == null) {
				continue;
			}
			String key = stringValue(item.get("resKey"));
			if (StrUtil.isBlank(key)) {
				continue;
			}
			if (item.get("position") == null) {
				item.put("position", i);
			}
			save(kind, key, item);
			count++;
		}
		return count;
	}

	public void delete(String kind, String key, String locale) {
		requireKind(kind);
		LandingResource row = find(kind, key, locale);
		if (row != null) {
			resourceMapper.deleteById(row.getId());
		}
	}

	/**
	 * 公开配置包：落地页启动时一次性拉取，避免多次往返。
	 */
	public Map<String, Object> publicBundle(String locale) {
		String target = StrUtil.blankToDefault(locale, "zh");
		Map<String, Object> bundle = new LinkedHashMap<>(4);

		// 1) SEO：path -> payload
		Map<String, Object> seo = new LinkedHashMap<>();
		for (LandingResource row : published("SEO", target)) {
			seo.put(row.getResKey(), parsePayload(row.getPayload()));
		}
		bundle.put("seo", seo);

		// 2) 区块编排：pageKey -> [ { sectionKey, position, enabled, props } ]
		Map<String, Object> sections = new LinkedHashMap<>();
		for (LandingResource row : published("SECTION", target)) {
			Object payload = parsePayload(row.getPayload());
			if (!(payload instanceof Map)) {
				continue;
			}
			@SuppressWarnings("unchecked")
			Map<String, Object> config = (Map<String, Object>) payload;
			Object sectionKey = config.get("sectionKey");
			if (sectionKey == null) {
				continue;
			}
			Map<String, Object> item = new LinkedHashMap<>(4);
			item.put("sectionKey", String.valueOf(sectionKey));
			item.put("position", row.getPosition());
			item.put("enabled", row.getEnabled());
			item.put("props", config.get("props") == null ? new LinkedHashMap<>() : config.get("props"));
			@SuppressWarnings("unchecked")
			List<Object> bucket = (List<Object>) sections.computeIfAbsent(row.getResKey(), k -> new ArrayList<>());
			bucket.add(item);
		}
		bundle.put("sections", sections);

		// 3) 推广位：仅返回处于生效窗口内且启用的
		List<Object> promotions = new ArrayList<>();
		for (LandingResource row : published("PROMOTION", target)) {
			if (!inWindow(row)) {
				continue;
			}
			Object payload = parsePayload(row.getPayload());
			if (!(payload instanceof Map)) {
				continue;
			}
			@SuppressWarnings("unchecked")
			Map<String, Object> config = new LinkedHashMap<>((Map<String, Object>) payload);
			config.put("id", row.getResKey());
			promotions.add(config);
		}
		bundle.put("promotions", promotions);

		// 4) 精选位
		List<Object> featured = new ArrayList<>();
		for (LandingResource row : published("FEATURED", target)) {
			Object payload = parsePayload(row.getPayload());
			if (!(payload instanceof Map)) {
				continue;
			}
			@SuppressWarnings("unchecked")
			Map<String, Object> config = new LinkedHashMap<>((Map<String, Object>) payload);
			config.put("position", row.getPosition());
			featured.add(config);
		}
		bundle.put("featured", featured);

		return bundle;
	}

	/**
	 * 公开单个投放页。
	 */
	public Map<String, Object> publicPage(String slug, String locale) {
		LandingResource row = find("CAMPAIGN_PAGE", slug, StrUtil.blankToDefault(locale, "zh"));
		if (row == null || !"PUBLISHED".equalsIgnoreCase(row.getStatus()) || !inWindow(row)) {
			return null;
		}
		Object payload = parsePayload(row.getPayload());
		Map<String, Object> result = new LinkedHashMap<>(5);
		result.put("slug", row.getResKey());
		result.put("locale", row.getLocale());
		if (payload instanceof Map) {
			@SuppressWarnings("unchecked")
			Map<String, Object> config = (Map<String, Object>) payload;
			result.put("title", config.get("title"));
			result.put("blocks", config.get("blocks") == null ? new ArrayList<>() : config.get("blocks"));
			result.put("seo", config.get("seo"));
		} else {
			result.put("blocks", new ArrayList<>());
		}
		return result;
	}

	private List<LandingResource> published(String kind, String locale) {
		return resourceMapper.selectList(Wrappers.<LandingResource>lambdaQuery()
			.eq(LandingResource::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingResource::getResKind, kind)
			.eq(LandingResource::getLocale, locale)
			.eq(LandingResource::getEnabled, true)
			.eq(LandingResource::getStatus, "PUBLISHED")
			.orderByAsc(LandingResource::getPosition)
			.orderByAsc(LandingResource::getId));
	}

	private LandingResource find(String kind, String key, String locale) {
		return resourceMapper.selectOne(Wrappers.<LandingResource>lambdaQuery()
			.eq(LandingResource::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingResource::getResKind, kind.toUpperCase())
			.eq(LandingResource::getResKey, key)
			.eq(LandingResource::getLocale, StrUtil.blankToDefault(locale, "zh"))
			.last("LIMIT 1"));
	}

	private Map<String, Object> toMap(LandingResource row) {
		Map<String, Object> item = new LinkedHashMap<>(12);
		item.put("id", row.getId());
		item.put("resKind", row.getResKind());
		item.put("resKey", row.getResKey());
		item.put("locale", row.getLocale());
		item.put("payload", parsePayload(row.getPayload()));
		item.put("status", row.getStatus());
		item.put("position", row.getPosition());
		item.put("enabled", row.getEnabled());
		item.put("startTime", row.getStartTime());
		item.put("endTime", row.getEndTime());
		item.put("remark", row.getRemark());
		item.put("updateTime", row.getUpdateTime());
		return item;
	}

	private Object parsePayload(String json) {
		if (StrUtil.isBlank(json)) {
			return new LinkedHashMap<String, Object>();
		}
		try {
			String trimmed = json.trim();
			if (trimmed.startsWith("[")) {
				return JSONUtil.parseArray(trimmed).toList(Map.class);
			}
			JSONObject object = JSONUtil.parseObj(trimmed);
			Map<String, Object> map = new LinkedHashMap<>();
			for (Map.Entry<String, Object> entry : object.entrySet()) {
				map.put(entry.getKey(), entry.getValue());
			}
			return map;
		} catch (Exception e) {
			return new LinkedHashMap<String, Object>();
		}
	}

	private boolean inWindow(LandingResource row) {
		LocalDateTime now = LocalDateTime.now();
		if (row.getStartTime() != null && now.isBefore(row.getStartTime())) {
			return false;
		}
		return row.getEndTime() == null || !now.isAfter(row.getEndTime());
	}

	private String normalizeStatus(Object status, boolean creating) {
		String value = stringValue(status).toUpperCase();
		if ("DRAFT".equals(value) || "PUBLISHED".equals(value) || "OFFLINE".equals(value)) {
			return value;
		}
		return creating ? "PUBLISHED" : "PUBLISHED";
	}

	private LocalDateTime parseDateTime(Object value) {
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

	private void requireKind(String kind) {
		if (StrUtil.isBlank(kind) || !KINDS.contains(kind.toUpperCase())) {
			throw new ServiceException("不支持的配置类型：" + kind);
		}
	}

	private static String stringValue(Object value) {
		return value == null ? "" : String.valueOf(value);
	}
}
