package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.digest.DigestUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingContent;
import com.knowledge.system.mapper.LandingContentMapper;
import lombok.AllArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 文案 CMS 的扩展能力（P1-5）：一键导入、覆盖率、预览令牌。
 *
 * <p>导入与覆盖率的键模型与落地页消费方一致：`landing_content` 每行是一个
 * 「内容键」（通常是 i18n 命名空间），其 payload 是**一层**的
 * `{ "home.hero-cta-primary": "文案" }`。落地页 `ops/content.ts` 的
 * `flattenEntries` 只遍历一层，因此这里按命名空间分组，保证导入后能被正确合并。</p>
 */
@Service
@AllArgsConstructor
public class LandingContentExtService {

	private static final String TOKEN_SEPARATOR = ".";
	private static final int MAX_IMPORT_KEYS = 20000;

	private final LandingContentMapper contentMapper;

	/**
	 * 预览令牌签名密钥。未配置时使用内置默认值（仅用于本地/预发），
	 * 生产环境请通过 `knowledge.landing.preview-secret` 覆盖。
	 */
	@Value("${knowledge.landing.preview-secret:kotion-landing-preview}")
	private String previewSecret;

	/**
	 * 一键导入：把「扁平 i18n 键 → 文案」按命名空间分组写入草稿。
	 *
	 * @param locale    语言
	 * @param entries   扁平键值对
	 * @param overwrite 是否覆盖命名空间下已存在的同名键
	 */
	@Transactional(rollbackFor = Exception.class)
	public Map<String, Object> importEntries(String locale, Map<String, String> entries, boolean overwrite) {
		if (entries == null || entries.isEmpty()) {
			throw new ServiceException("导入内容为空");
		}
		if (entries.size() > MAX_IMPORT_KEYS) {
			throw new ServiceException("单次导入最多 " + MAX_IMPORT_KEYS + " 条");
		}

		// 1) 按命名空间分组：key 的第一段作为内容键
		Map<String, Map<String, String>> grouped = new LinkedHashMap<>();
		for (Map.Entry<String, String> entry : entries.entrySet()) {
			String key = StrUtil.trimToEmpty(entry.getKey());
			if (key.isEmpty() || entry.getValue() == null) {
				continue;
			}
			String namespace = key.contains(".") ? key.substring(0, key.indexOf('.')) : key;
			Map<String, String> bucket = grouped.computeIfAbsent(namespace, k -> new LinkedHashMap<>());
			bucket.put(key, entry.getValue());
		}

		int imported = 0;
		int skipped = 0;
		for (Map.Entry<String, Map<String, String>> group : grouped.entrySet()) {
			String contentKey = group.getKey();
			LandingContent row = find(contentKey, locale);
			Map<String, Object> merged = new LinkedHashMap<>();
			if (row != null && StrUtil.isNotBlank(row.getDraft())) {
				merged.putAll(parseFlat(row.getDraft()));
			}
			for (Map.Entry<String, String> item : group.getValue().entrySet()) {
				if (!overwrite && merged.containsKey(item.getKey())) {
					skipped++;
					continue;
				}
				merged.put(item.getKey(), item.getValue());
				imported++;
			}
			saveDraftRow(row, contentKey, locale, JSONUtil.toJsonStr(merged), "import");
		}

		Map<String, Object> result = new LinkedHashMap<>(3);
		result.put("imported", imported);
		result.put("skipped", skipped);
		result.put("namespaces", grouped.size());
		return result;
	}

	/**
	 * 覆盖率：请求的键清单 vs 已存在的键清单。
	 */
	public Map<String, Object> coverage(String locale, List<String> keys) {
		Set<String> known = existingKeys(locale);
		List<String> requested = keys == null ? new ArrayList<>() : keys;

		List<String> missing = new ArrayList<>();
		for (String key : requested) {
			String normalized = StrUtil.trimToEmpty(key);
			if (!normalized.isEmpty() && !known.contains(normalized)) {
				missing.add(normalized);
			}
		}
		Set<String> requestedSet = new LinkedHashSet<>();
		for (String key : requested) {
			requestedSet.add(StrUtil.trimToEmpty(key));
		}
		List<String> orphans = new ArrayList<>();
		for (String key : known) {
			if (!requestedSet.contains(key)) {
				orphans.add(key);
			}
		}

		int total = requestedSet.size();
		Map<String, Object> result = new LinkedHashMap<>(6);
		result.put("locale", locale);
		result.put("totalKeys", total);
		result.put("translatedKeys", Math.max(0, total - missing.size()));
		result.put("missingKeys", missing);
		result.put("orphanKeys", orphans);
		result.put("knownKeys", known.size());
		return result;
	}

	/**
	 * 生成预览令牌，并给出可直接打开的预览链接。
	 */
	public Map<String, Object> createPreviewToken(String locale, Integer ttlMinutes, String landingOrigin) {
		int ttl = ttlMinutes == null || ttlMinutes <= 0 ? 60 : Math.min(ttlMinutes, 24 * 60);
		long expiresAt = System.currentTimeMillis() + ttl * 60_000L;
		String payload = (StrUtil.blankToDefault(locale, "zh") + "|" + expiresAt);
		String token = encode(payload) + TOKEN_SEPARATOR + sign(payload);
		String origin = StrUtil.blankToDefault(landingOrigin, "https://kotion.top");
		String url = origin + (locale != null && locale.startsWith("en") ? "/en" : "") + "/?kn_preview=" + token;

		Map<String, Object> result = new LinkedHashMap<>(4);
		result.put("token", token);
		result.put("url", url);
		result.put("locale", StrUtil.blankToDefault(locale, "zh"));
		result.put("expiresAt", LocalDateTime.now().plusMinutes(ttl).toString());
		return result;
	}

	/**
	 * 校验预览令牌，返回其语言；无效或过期返回 null。
	 */
	public String verifyPreviewToken(String token) {
		if (StrUtil.isBlank(token) || !token.contains(TOKEN_SEPARATOR)) {
			return null;
		}
		int index = token.lastIndexOf(TOKEN_SEPARATOR);
		String encoded = token.substring(0, index);
		String signature = token.substring(index + 1);
		String payload;
		try {
			payload = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
		} catch (IllegalArgumentException e) {
			return null;
		}
		if (!sign(payload).equals(signature)) {
			return null;
		}
		String[] parts = payload.split("\\|");
		if (parts.length != 2) {
			return null;
		}
		try {
			if (Long.parseLong(parts[1]) < System.currentTimeMillis()) {
				return null;
			}
		} catch (NumberFormatException e) {
			return null;
		}
		return parts[0];
	}

	/**
	 * 预览：返回某语言的**草稿**内容包，结构与本服务 {@code publishedPayloads} 保持一致。
	 */
	public Map<String, Object> draftPayloads(String locale) {
		List<LandingContent> rows = contentMapper.selectList(Wrappers.<LandingContent>lambdaQuery()
			.eq(LandingContent::getLocale, locale)
			.isNotNull(LandingContent::getDraft)
			.orderByAsc(LandingContent::getContentKey));
		Map<String, Object> entries = new LinkedHashMap<>();
		for (LandingContent row : rows) {
			entries.put(row.getContentKey(), parseFlat(row.getDraft()));
		}
		Map<String, Object> result = new LinkedHashMap<>(3);
		result.put("locale", locale);
		result.put("preview", true);
		result.put("entries", entries);
		return result;
	}

	// ---------- 内部 ----------

	private Set<String> existingKeys(String locale) {
		List<LandingContent> rows = contentMapper.selectList(Wrappers.<LandingContent>lambdaQuery()
			.eq(LandingContent::getLocale, locale)
			.orderByAsc(LandingContent::getContentKey));
		Set<String> keys = new LinkedHashSet<>();
		for (LandingContent row : rows) {
			String source = StrUtil.isNotBlank(row.getDraft()) ? row.getDraft() : row.getPublished();
			keys.addAll(parseFlat(source).keySet());
		}
		return keys;
	}

	private Map<String, String> parseFlat(String json) {
		Map<String, String> flat = new LinkedHashMap<>();
		if (StrUtil.isBlank(json)) {
			return flat;
		}
		try {
			JSONObject object = JSONUtil.parseObj(json);
			for (Map.Entry<String, Object> entry : object.entrySet()) {
				if (entry.getValue() instanceof String) {
					flat.put(entry.getKey(), (String) entry.getValue());
				}
			}
		} catch (Exception e) {
			// 存储损坏时按空处理，避免整页 500
		}
		return flat;
	}

	private LandingContent find(String key, String locale) {
		return contentMapper.selectOne(Wrappers.<LandingContent>lambdaQuery()
			.eq(LandingContent::getContentKey, key)
			.eq(LandingContent::getLocale, locale)
			.last("LIMIT 1"));
	}

	private void saveDraftRow(LandingContent row, String key, String locale, String json, String operator) {
		LocalDateTime now = LocalDateTime.now();
		if (row == null) {
			row = new LandingContent();
			row.setContentKey(key);
			row.setLocale(locale);
			row.setDraft(json);
			row.setContentVersion(0);
			row.setUpdatedBy(operator);
			row.setCreateTime(now);
			row.setUpdateTime(now);
			contentMapper.insert(row);
			return;
		}
		row.setDraft(json);
		row.setUpdatedBy(operator);
		row.setUpdateTime(now);
		contentMapper.updateById(row);
	}

	private String encode(String payload) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8));
	}

	private String sign(String payload) {
		String secret = StrUtil.blankToDefault(previewSecret, "kotion-landing-preview");
		return DigestUtil.sha256Hex(payload + "|" + secret).substring(0, 32);
	}
}
