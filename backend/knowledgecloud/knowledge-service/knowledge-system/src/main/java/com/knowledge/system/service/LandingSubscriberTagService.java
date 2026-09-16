package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingSubscriber;
import com.knowledge.system.domain.LandingSubscriberTag;
import com.knowledge.system.domain.LandingSubscriberTagRel;
import com.knowledge.system.mapper.LandingOpsMapper;
import com.knowledge.system.mapper.LandingSubscriberMapper;
import com.knowledge.system.mapper.LandingSubscriberTagMapper;
import com.knowledge.system.mapper.LandingSubscriberTagRelMapper;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 订阅线索标签（P1-10）。
 *
 * <p>标签是运营分群的抓手：既用于后台筛选，也会在活动人群选择器里生效。
 * 关联关系落在 {@code landing_subscriber_tag_rel}，同时把标签名快照写回
 * {@code landing_subscriber.tags}，让 CSV 导出与包含匹配不必再联表。</p>
 */
@Service
@AllArgsConstructor
public class LandingSubscriberTagService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";
	private static final int TAGS_SNAPSHOT_MAX = 512;

	private final LandingSubscriberTagMapper tagMapper;
	private final LandingSubscriberTagRelMapper tagRelMapper;
	private final LandingSubscriberMapper subscriberMapper;
	private final LandingOpsMapper opsMapper;

	/** 标签列表（附带每个标签的订阅人数）。 */
	public List<Map<String, Object>> list() {
		List<LandingSubscriberTag> rows = tagMapper.selectList(Wrappers.<LandingSubscriberTag>lambdaQuery()
			.eq(LandingSubscriberTag::getSiteId, DEFAULT_SITE_ID)
			.orderByAsc(LandingSubscriberTag::getTag));
		Map<String, Integer> sizes = new LinkedHashMap<>();
		for (Map<String, Object> row : opsMapper.selectTagSizes()) {
			if (row == null || row.get("tagId") == null) {
				continue;
			}
			sizes.put(String.valueOf(row.get("tagId")), toInt(row.get("total")));
		}
		List<Map<String, Object>> result = new ArrayList<>(rows.size());
		for (LandingSubscriberTag row : rows) {
			Integer size = sizes.get(String.valueOf(row.getId()));
			result.add(toMap(row, size == null ? 0 : size));
		}
		return result;
	}

	public Map<String, Object> create(Map<String, Object> body) {
		LandingSubscriberTag row = new LandingSubscriberTag();
		row.setSiteId(DEFAULT_SITE_ID);
		apply(row, body, true);
		long exists = tagMapper.selectCount(Wrappers.<LandingSubscriberTag>lambdaQuery()
			.eq(LandingSubscriberTag::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingSubscriberTag::getTag, row.getTag()));
		if (exists > 0) {
			throw new ServiceException("标签已存在：" + row.getTag());
		}
		LocalDateTime now = LocalDateTime.now();
		row.setCreateTime(now);
		row.setUpdateTime(now);
		tagMapper.insert(row);
		return toMap(row, 0);
	}

	public Map<String, Object> update(Long id, Map<String, Object> body) {
		LandingSubscriberTag row = tagMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("标签不存在");
		}
		apply(row, body, false);
		long exists = tagMapper.selectCount(Wrappers.<LandingSubscriberTag>lambdaQuery()
			.eq(LandingSubscriberTag::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingSubscriberTag::getTag, row.getTag())
			.ne(LandingSubscriberTag::getId, id));
		if (exists > 0) {
			throw new ServiceException("标签已存在：" + row.getTag());
		}
		row.setUpdateTime(LocalDateTime.now());
		tagMapper.updateById(row);
		return toMap(row, countByTag(id));
	}

	/** 删除标签，同时清理订阅关联。 */
	@Transactional(rollbackFor = Exception.class)
	public void delete(Long id) {
		tagRelMapper.delete(Wrappers.<LandingSubscriberTagRel>lambdaQuery()
			.eq(LandingSubscriberTagRel::getTagId, id));
		tagMapper.deleteById(id);
	}

	/**
	 * 覆盖式设置某个订阅者的标签，并刷新 {@code landing_subscriber.tags} 快照。
	 */
	@Transactional(rollbackFor = Exception.class)
	public void setSubscriberTags(Long subscriberId, List<Long> tagIds) {
		if (subscriberId == null) {
			return;
		}
		LandingSubscriber subscriber = subscriberMapper.selectById(subscriberId);
		if (subscriber == null) {
			throw new ServiceException("订阅记录不存在");
		}
		LocalDateTime now = LocalDateTime.now();
		tagRelMapper.delete(Wrappers.<LandingSubscriberTagRel>lambdaQuery()
			.eq(LandingSubscriberTagRel::getSubscriberId, subscriberId));

		Set<Long> distinct = new LinkedHashSet<>();
		if (tagIds != null) {
			for (Long tagId : tagIds) {
				if (tagId != null) {
					distinct.add(tagId);
				}
			}
		}
		List<String> names = new ArrayList<>(distinct.size());
		for (Long tagId : distinct) {
			LandingSubscriberTag tag = tagMapper.selectById(tagId);
			if (tag == null) {
				continue;
			}
			LandingSubscriberTagRel rel = new LandingSubscriberTagRel();
			rel.setSubscriberId(subscriberId);
			rel.setTagId(tagId);
			rel.setCreateTime(now);
			rel.setUpdateTime(now);
			tagRelMapper.insert(rel);
			names.add(tag.getTag());
		}

		String snapshot = names.isEmpty() ? null : StrUtil.sub(String.join(",", names), 0, TAGS_SNAPSHOT_MAX);
		// 快照可能被清空，必须走 UpdateWrapper 才能把列写成 NULL（updateById 会忽略 null 字段）。
		subscriberMapper.update(null, Wrappers.<LandingSubscriber>lambdaUpdate()
			.eq(LandingSubscriber::getId, subscriberId)
			.set(LandingSubscriber::getTags, snapshot)
			.set(LandingSubscriber::getUpdateTime, now));
	}

	public List<Long> tagIdsOf(Long subscriberId) {
		List<Long> ids = new ArrayList<>();
		if (subscriberId == null) {
			return ids;
		}
		List<LandingSubscriberTagRel> rels = tagRelMapper.selectList(
			Wrappers.<LandingSubscriberTagRel>lambdaQuery()
				.eq(LandingSubscriberTagRel::getSubscriberId, subscriberId));
		for (LandingSubscriberTagRel rel : rels) {
			if (rel.getTagId() != null) {
				ids.add(rel.getTagId());
			}
		}
		return ids;
	}

	public int countByTag(Long tagId) {
		if (tagId == null) {
			return 0;
		}
		long count = tagRelMapper.selectCount(Wrappers.<LandingSubscriberTagRel>lambdaQuery()
			.eq(LandingSubscriberTagRel::getTagId, tagId));
		return (int) Math.min(count, Integer.MAX_VALUE);
	}

	private Map<String, Object> toMap(LandingSubscriberTag row, int total) {
		Map<String, Object> item = new LinkedHashMap<>(6);
		item.put("id", row.getId());
		item.put("tag", row.getTag());
		item.put("color", row.getColor());
		item.put("description", row.getDescription());
		item.put("total", total);
		item.put("createTime", row.getCreateTime());
		return item;
	}

	private void apply(LandingSubscriberTag row, Map<String, Object> body, boolean creating) {
		Map<String, Object> safe = body == null ? new LinkedHashMap<String, Object>() : body;
		if (creating || StrUtil.isNotBlank(stringValue(safe.get("tag")))) {
			String tag = StrUtil.trimToEmpty(stringValue(safe.get("tag")));
			if (tag.isEmpty()) {
				throw new ServiceException("标签名称不能为空");
			}
			row.setTag(StrUtil.sub(tag, 0, 64));
		}
		if (safe.get("color") != null) {
			row.setColor(StrUtil.sub(stringValue(safe.get("color")), 0, 16));
		}
		if (safe.get("description") != null) {
			row.setDescription(StrUtil.sub(stringValue(safe.get("description")), 0, 255));
		}
		if (StrUtil.isBlank(row.getTag())) {
			throw new ServiceException("标签名称不能为空");
		}
	}

	private static int toInt(Object value) {
		if (value == null) {
			return 0;
		}
		if (value instanceof Number) {
			return ((Number) value).intValue();
		}
		try {
			return Integer.parseInt(String.valueOf(value).trim());
		} catch (NumberFormatException e) {
			return 0;
		}
	}

	private static String stringValue(Object value) {
		return value == null ? "" : String.valueOf(value);
	}
}
