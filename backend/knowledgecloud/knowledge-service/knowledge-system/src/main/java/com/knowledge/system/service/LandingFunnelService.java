package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingFunnel;
import com.knowledge.system.mapper.LandingFunnelMapper;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 保存漏斗（P0-7）。
 *
 * <p>替代「看板上手输逗号分隔事件名」的临时做法：漏斗可命名、可保存、可复用，
 * 统计仍复用 {@link LandingStatsService#funnel} 的既有口径。</p>
 *
 * <p>对外统一返回已解析的步骤数组（数据库里存的是 JSON 文本），
 * 前端拿到就是结构化数据，无需二次解析。</p>
 */
@Service
@AllArgsConstructor
public class LandingFunnelService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";

	private final LandingFunnelMapper funnelMapper;
	private final LandingStatsService landingStatsService;

	/** 列表：步骤解析为数组。 */
	public List<Map<String, Object>> list() {
		List<LandingFunnel> rows = funnelMapper.selectList(Wrappers.<LandingFunnel>lambdaQuery()
			.orderByAsc(LandingFunnel::getPosition)
			.orderByAsc(LandingFunnel::getId));
		List<Map<String, Object>> result = new ArrayList<>(rows.size());
		for (LandingFunnel row : rows) {
			result.add(toMap(row));
		}
		return result;
	}

	public Map<String, Object> create(Map<String, Object> body) {
		LandingFunnel row = new LandingFunnel();
		row.setSiteId(DEFAULT_SITE_ID);
		apply(row, body, true);
		long count = funnelMapper.selectCount(Wrappers.<LandingFunnel>lambdaQuery()
			.eq(LandingFunnel::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingFunnel::getFunnelKey, row.getFunnelKey()));
		if (count > 0) {
			throw new ServiceException("漏斗标识已存在：" + row.getFunnelKey());
		}
		LocalDateTime now = LocalDateTime.now();
		row.setCreateTime(now);
		row.setUpdateTime(now);
		funnelMapper.insert(row);
		return toMap(row);
	}

	public Map<String, Object> update(Long id, Map<String, Object> body) {
		LandingFunnel row = funnelMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("漏斗不存在");
		}
		apply(row, body, false);
		row.setUpdateTime(LocalDateTime.now());
		funnelMapper.updateById(row);
		return toMap(row);
	}

	public void delete(Long id) {
		funnelMapper.deleteById(id);
	}

	/**
	 * 按保存的漏斗定义计算各步骤转化。
	 */
	public Map<String, Object> stats(String funnelKey, int days) {
		LandingFunnel funnel = funnelMapper.selectOne(Wrappers.<LandingFunnel>lambdaQuery()
			.eq(LandingFunnel::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingFunnel::getFunnelKey, funnelKey)
			.last("LIMIT 1"));
		if (funnel == null) {
			throw new ServiceException("漏斗不存在：" + funnelKey);
		}
		List<Map<String, String>> steps = toStatSteps(funnel.getSteps());
		Map<String, Object> computed = landingStatsService.funnel(DEFAULT_SITE_ID, days, steps);
		Map<String, Object> result = new LinkedHashMap<>(3);
		result.put("funnelKey", funnel.getFunnelKey());
		result.put("name", funnel.getName());
		result.put("steps", computed == null ? new ArrayList<>() : computed.get("result"));
		return result;
	}

	private Map<String, Object> toMap(LandingFunnel row) {
		Map<String, Object> item = new LinkedHashMap<>(9);
		item.put("id", row.getId());
		item.put("funnelKey", row.getFunnelKey());
		item.put("name", row.getName());
		item.put("steps", parseSteps(row.getSteps()));
		item.put("description", row.getDescription());
		item.put("enabled", row.getEnabled());
		item.put("position", row.getPosition());
		return item;
	}

	private List<Map<String, Object>> parseSteps(String json) {
		List<Map<String, Object>> steps = new ArrayList<>();
		if (StrUtil.isBlank(json)) {
			return steps;
		}
		try {
			for (Object item : JSONUtil.parseArray(json)) {
				if (item instanceof Map) {
					@SuppressWarnings("unchecked")
					Map<String, Object> step = (Map<String, Object>) item;
					Map<String, Object> entry = new LinkedHashMap<>(3);
					entry.put("label", step.get("label"));
					entry.put("type", step.get("type"));
					entry.put("value", step.get("value"));
					steps.add(entry);
				}
			}
		} catch (Exception e) {
			// 存储损坏时返回空数组，避免整个列表接口 500
		}
		return steps;
	}

	private List<Map<String, String>> toStatSteps(String json) {
		List<Map<String, String>> steps = new ArrayList<>();
		for (Map<String, Object> step : parseSteps(json)) {
			Map<String, String> normalized = new LinkedHashMap<>(3);
			normalized.put("label", String.valueOf(step.get("label")));
			normalized.put("type", String.valueOf(step.get("type")));
			normalized.put("value", String.valueOf(step.get("value")));
			steps.add(normalized);
		}
		return steps;
	}

	@SuppressWarnings("unchecked")
	private void apply(LandingFunnel row, Map<String, Object> body, boolean creating) {
		if (creating || StrUtil.isNotBlank(stringValue(body.get("funnelKey")))) {
			String key = StrUtil.trimToEmpty(stringValue(body.get("funnelKey")));
			if (key.isEmpty()) {
				throw new ServiceException("漏斗标识不能为空");
			}
			row.setFunnelKey(StrUtil.sub(key.replaceAll("[^a-zA-Z0-9_.-]", "-"), 0, 64));
		}
		if (body.get("name") != null) {
			row.setName(StrUtil.sub(stringValue(body.get("name")), 0, 128));
		}
		if (body.get("steps") != null) {
			List<Object> normalized = new ArrayList<>();
			Object raw = body.get("steps");
			if (raw instanceof List) {
				for (Object item : (List<Object>) raw) {
					if (!(item instanceof Map)) {
						continue;
					}
					Map<String, Object> step = (Map<String, Object>) item;
					String value = StrUtil.trimToEmpty(stringValue(step.get("value")));
					if (value.isEmpty()) {
						continue;
					}
					Map<String, Object> entry = new LinkedHashMap<>(3);
					entry.put("label", StrUtil.blankToDefault(stringValue(step.get("label")), value));
					entry.put("type", "path".equalsIgnoreCase(stringValue(step.get("type"))) ? "path" : "event");
					entry.put("value", value);
					normalized.add(entry);
				}
			}
			if (normalized.size() < 2) {
				throw new ServiceException("漏斗至少需要 2 个有效步骤");
			}
			row.setSteps(JSONUtil.toJsonStr(normalized));
		}
		if (body.get("description") != null) {
			row.setDescription(StrUtil.sub(stringValue(body.get("description")), 0, 255));
		}
		row.setEnabled(body.get("enabled") == null ? Boolean.TRUE : Boolean.valueOf(stringValue(body.get("enabled"))));
		row.setPosition(body.get("position") == null ? 0 : Integer.valueOf(stringValue(body.get("position"))));
		if (StrUtil.isBlank(row.getName()) || StrUtil.isBlank(row.getSteps())) {
			throw new ServiceException("漏斗名称与步骤不能为空");
		}
	}

	private static String stringValue(Object value) {
		return value == null ? "" : String.valueOf(value);
	}
}
