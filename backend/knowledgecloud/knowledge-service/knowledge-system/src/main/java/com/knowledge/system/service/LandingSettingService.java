package com.knowledge.system.service;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.system.domain.LandingSetting;
import com.knowledge.system.mapper.LandingSettingMapper;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 落地页公开设置服务（SEO / 社交链接等）
 */
@Service
@AllArgsConstructor
public class LandingSettingService {

	private static final String PUBLIC_PREFIX = "public.";

	private final LandingSettingMapper settingMapper;

	public Map<String, String> all() {
		List<LandingSetting> rows = settingMapper.selectList(Wrappers.<LandingSetting>lambdaQuery()
			.orderByAsc(LandingSetting::getSettingKey));
		Map<String, String> result = new LinkedHashMap<>();
		for (LandingSetting row : rows) {
			result.put(row.getSettingKey(), row.getSettingValue());
		}
		return result;
	}

	/**
	 * 公开设置：仅暴露 public. 前缀，并去掉前缀。
	 */
	public Map<String, String> publicSettings() {
		Map<String, String> result = new LinkedHashMap<>();
		for (Map.Entry<String, String> entry : all().entrySet()) {
			if (entry.getKey().startsWith(PUBLIC_PREFIX)) {
				result.put(entry.getKey().substring(PUBLIC_PREFIX.length()), entry.getValue());
			}
		}
		return result;
	}

	public int put(Map<String, ?> entries) {
		int count = 0;
		LocalDateTime now = LocalDateTime.now();
		for (Map.Entry<String, ?> entry : entries.entrySet()) {
			String key = entry.getKey();
			if (key == null || !key.matches("[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}")) {
				continue;
			}
			String value = entry.getValue() instanceof String
				? (String) entry.getValue()
				: cn.hutool.json.JSONUtil.toJsonStr(entry.getValue());
			LandingSetting existing = settingMapper.selectOne(Wrappers.<LandingSetting>lambdaQuery()
				.eq(LandingSetting::getSettingKey, key)
				.last("LIMIT 1"));
			if (existing == null) {
				LandingSetting row = new LandingSetting();
				row.setSettingKey(key);
				row.setSettingValue(value);
				settingMapper.insert(row);
			} else {
				existing.setSettingValue(value);
				settingMapper.updateById(existing);
			}
			count++;
		}
		return count;
	}
}
