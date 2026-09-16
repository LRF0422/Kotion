package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingEventDict;
import com.knowledge.system.mapper.LandingEventDictMapper;
import com.knowledge.system.mapper.LandingOpsMapper;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 事件字典（P0-5）。
 *
 * <p>字典是前端埋点的契约：前端 `src/ops/events.ts` 是写入源，
 * 后端这里保存同名清单并做「已注册 / 已收到 / 未注册 / 静默」对比。</p>
 */
@Service
@AllArgsConstructor
public class LandingEventDictService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";
	private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

	private final LandingEventDictMapper eventDictMapper;
	private final LandingOpsMapper opsMapper;

	public List<LandingEventDict> list() {
		return eventDictMapper.selectList(Wrappers.<LandingEventDict>lambdaQuery()
			.orderByAsc(LandingEventDict::getCategory)
			.orderByAsc(LandingEventDict::getEventName));
	}

	public LandingEventDict create(LandingEventDict payload) {
		String name = StrUtil.trimToEmpty(payload.getEventName());
		if (name.isEmpty()) {
			throw new ServiceException("事件名不能为空");
		}
		if (eventDictMapper.selectCount(Wrappers.<LandingEventDict>lambdaQuery()
			.eq(LandingEventDict::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingEventDict::getEventName, name)) > 0) {
			throw new ServiceException("事件已登记：" + name);
		}
		LandingEventDict row = new LandingEventDict();
		row.setSiteId(DEFAULT_SITE_ID);
		row.setEventName(StrUtil.sub(name, 0, 64));
		apply(row, payload);
		LocalDateTime now = LocalDateTime.now();
		row.setCreateTime(now);
		row.setUpdateTime(now);
		eventDictMapper.insert(row);
		return row;
	}

	public LandingEventDict update(Long id, LandingEventDict payload) {
		LandingEventDict row = eventDictMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("事件不存在");
		}
		apply(row, payload);
		row.setUpdateTime(LocalDateTime.now());
		eventDictMapper.updateById(row);
		return row;
	}

	public void delete(Long id) {
		eventDictMapper.deleteById(id);
	}

	/**
	 * 幂等同步：只新增缺失的事件。
	 */
	public Map<String, Object> sync(List<Map<String, String>> events) {
		int created = 0;
		int existing = 0;
		if (events != null) {
			for (Map<String, String> item : events) {
				if (item == null) {
					continue;
				}
				String name = StrUtil.trimToEmpty(item.get("eventName"));
				if (name.isEmpty()) {
					continue;
				}
				if (eventDictMapper.selectCount(Wrappers.<LandingEventDict>lambdaQuery()
					.eq(LandingEventDict::getSiteId, DEFAULT_SITE_ID)
					.eq(LandingEventDict::getEventName, name)) > 0) {
					existing++;
					continue;
				}
				LandingEventDict row = new LandingEventDict();
				row.setSiteId(DEFAULT_SITE_ID);
				row.setEventName(StrUtil.sub(name, 0, 64));
				row.setCategory(StrUtil.blankToDefault(item.get("category"), "GENERAL"));
				row.setDescription(StrUtil.sub(item.get("description"), 0, 255));
				row.setStatus("REGISTERED");
				LocalDateTime now = LocalDateTime.now();
				row.setCreateTime(now);
				row.setUpdateTime(now);
				eventDictMapper.insert(row);
				created++;
			}
		}
		Map<String, Object> result = new LinkedHashMap<>(2);
		result.put("created", created);
		result.put("existing", existing);
		return result;
	}

	/**
	 * 覆盖率对比：已注册 / 已收到 / 未注册 / 静默。
	 */
	public Map<String, Object> coverage(int days) {
		List<LandingEventDict> registered = list();
		Set<String> registeredNames = new LinkedHashSet<>();
		for (LandingEventDict row : registered) {
			registeredNames.add(row.getEventName());
		}

		String startDay = LocalDate.now().minusDays(Math.max(days, 1) - 1L).format(DAY);
		List<Map<String, Object>> observed = opsMapper.selectObservedEvents(DEFAULT_SITE_ID, startDay);
		Set<String> observedNames = new LinkedHashSet<>();
		List<String> unknown = new ArrayList<>();
		for (Map<String, Object> row : observed) {
			String name = String.valueOf(row.get("name"));
			observedNames.add(name);
			if (!registeredNames.contains(name)) {
				unknown.add(name);
			}
		}
		List<String> silent = new ArrayList<>();
		for (String name : registeredNames) {
			if (!observedNames.contains(name)) {
				silent.add(name);
			}
		}

		Map<String, Object> result = new LinkedHashMap<>(4);
		result.put("registered", new ArrayList<>(registeredNames));
		result.put("observed", observed);
		result.put("unknown", unknown);
		result.put("silent", silent);
		return result;
	}

	private void apply(LandingEventDict row, LandingEventDict payload) {
		row.setCategory(StrUtil.blankToDefault(payload.getCategory(), "GENERAL").toUpperCase());
		if (payload.getDescription() != null) {
			row.setDescription(StrUtil.sub(payload.getDescription(), 0, 255));
		}
		if (payload.getPropsSchema() != null) {
			row.setPropsSchema(payload.getPropsSchema());
		}
		row.setStatus("DEPRECATED".equalsIgnoreCase(payload.getStatus()) ? "DEPRECATED" : "REGISTERED");
		if (payload.getOwner() != null) {
			row.setOwner(StrUtil.sub(payload.getOwner(), 0, 64));
		}
	}
}
