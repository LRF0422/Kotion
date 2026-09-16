package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingContent;
import com.knowledge.system.domain.LandingContentRevision;
import com.knowledge.system.mapper.LandingContentMapper;
import com.knowledge.system.mapper.LandingContentRevisionMapper;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 落地页文案 CMS 服务
 *
 * <p>每个内容键按语言维护草稿与已发布两份 JSON，发布时落一条历史版本，支持回滚。</p>
 */
@Service
@AllArgsConstructor
public class LandingContentService {

	private final LandingContentMapper contentMapper;
	private final LandingContentRevisionMapper revisionMapper;

	/**
	 * 公开：某语言下全部已发布内容，供落地页一次性初始化。
	 */
	public Map<String, Object> publishedPayloads(String locale) {
		List<LandingContent> rows = contentMapper.selectList(Wrappers.<LandingContent>lambdaQuery()
			.eq(LandingContent::getLocale, locale)
			.isNotNull(LandingContent::getPublished));
		Map<String, Object> entries = new LinkedHashMap<>();
		int version = 0;
		for (LandingContent row : rows) {
			entries.put(row.getContentKey(), JSONUtil.parse(row.getPublished()));
			int current = row.getContentVersion() == null ? 0 : row.getContentVersion();
			version = Math.max(version, current);
		}
		Map<String, Object> result = new LinkedHashMap<>();
		result.put("locale", locale);
		result.put("version", version);
		result.put("entries", entries);
		return result;
	}

	/**
	 * 公开：单个内容键的已发布内容。
	 */
	public Object published(String key, String locale) {
		LandingContent row = find(key, locale);
		if (row == null || StrUtil.isBlank(row.getPublished())) {
			throw new ServiceException("内容尚未发布：" + key);
		}
		return JSONUtil.parse(row.getPublished());
	}

	public List<LandingContent> list(String locale) {
		return contentMapper.selectList(Wrappers.<LandingContent>lambdaQuery()
			.eq(StrUtil.isNotBlank(locale), LandingContent::getLocale, locale)
			.orderByAsc(LandingContent::getContentKey));
	}

	public LandingContent detail(String key, String locale) {
		LandingContent row = find(key, locale);
		if (row != null) {
			return row;
		}
		LandingContent empty = new LandingContent();
		empty.setContentKey(key);
		empty.setLocale(locale);
		empty.setDraft("{}");
		empty.setContentVersion(0);
		return empty;
	}

	public LandingContent saveDraft(String key, String locale, Object draft, String operator) {
		if (draft == null) {
			throw new ServiceException("草稿内容不能为空");
		}
		String json = JSONUtil.toJsonStr(draft);
		if (json.length() > 512 * 1024) {
			throw new ServiceException("草稿内容过大");
		}
		LandingContent row = find(key, locale);
		LocalDateTime now = LocalDateTime.now();
		if (row == null) {
			row = new LandingContent();
			row.setContentKey(key);
			row.setLocale(locale);
			row.setDraft(json);
			row.setContentVersion(0);
			row.setUpdatedBy(operator);
			contentMapper.insert(row);
		} else {
			row.setDraft(json);
			row.setUpdatedBy(operator);
			contentMapper.updateById(row);
		}
		return row;
	}

	@Transactional(rollbackFor = Exception.class)
	public LandingContent publish(String key, String locale, String note, String operator) {
		LandingContent row = find(key, locale);
		if (row == null) {
			throw new ServiceException("内容不存在，无法发布：" + key);
		}
		LocalDateTime now = LocalDateTime.now();
		int nextVersion = (row.getContentVersion() == null ? 0 : row.getContentVersion()) + 1;
		row.setPublished(row.getDraft());
		row.setContentVersion(nextVersion);
		row.setPublishedAt(now);
		row.setUpdatedBy(operator);
		contentMapper.updateById(row);

		LandingContentRevision revision = new LandingContentRevision();
		revision.setContentKey(key);
		revision.setLocale(locale);
		revision.setContentVersion(nextVersion);
		revision.setPayload(row.getDraft() == null ? "{}" : row.getDraft());
		revision.setNote(StrUtil.sub(note, 0, 255));
		revision.setCreatedBy(operator);
		revision.setCreateTime(now);
		revision.setUpdateTime(now);
		revisionMapper.insert(revision);
		return row;
	}

	public List<LandingContentRevision> revisions(String key, String locale) {
		return revisionMapper.selectList(Wrappers.<LandingContentRevision>lambdaQuery()
			.eq(LandingContentRevision::getContentKey, key)
			.eq(LandingContentRevision::getLocale, locale)
			.orderByDesc(LandingContentRevision::getContentVersion)
			.last("LIMIT 50"));
	}

	public LandingContent rollback(String key, String locale, Integer version) {
		if (version == null) {
			throw new ServiceException("版本号不能为空");
		}
		LandingContentRevision revision = revisionMapper.selectOne(Wrappers.<LandingContentRevision>lambdaQuery()
			.eq(LandingContentRevision::getContentKey, key)
			.eq(LandingContentRevision::getLocale, locale)
			.eq(LandingContentRevision::getContentVersion, version));
		if (revision == null) {
			throw new ServiceException("版本不存在：" + version);
		}
		return saveDraft(key, locale, JSONUtil.parse(revision.getPayload()), "rollback@" + version);
	}

	private LandingContent find(String key, String locale) {
		return contentMapper.selectOne(Wrappers.<LandingContent>lambdaQuery()
			.eq(LandingContent::getContentKey, key)
			.eq(LandingContent::getLocale, locale)
			.last("LIMIT 1"));
	}
}
