package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingFilterRule;
import com.knowledge.system.mapper.LandingFilterRuleMapper;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 落地页流量过滤规则（P0-4）。
 *
 * <p>用于排除内部 IP、测试设备、爬虫 UA 等噪音流量，避免污染运营数据。</p>
 */
@Service
@AllArgsConstructor
public class LandingFilterRuleService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";

	private final LandingFilterRuleMapper filterRuleMapper;

	public List<LandingFilterRule> list() {
		return filterRuleMapper.selectList(Wrappers.<LandingFilterRule>lambdaQuery()
			.orderByDesc(LandingFilterRule::getId));
	}

	public LandingFilterRule create(LandingFilterRule payload) {
		LandingFilterRule row = new LandingFilterRule();
		apply(row, payload);
		LocalDateTime now = LocalDateTime.now();
		row.setCreateTime(now);
		row.setUpdateTime(now);
		filterRuleMapper.insert(row);
		return row;
	}

	public LandingFilterRule update(Long id, LandingFilterRule payload) {
		LandingFilterRule row = filterRuleMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("过滤规则不存在");
		}
		apply(row, payload);
		row.setUpdateTime(LocalDateTime.now());
		filterRuleMapper.updateById(row);
		return row;
	}

	public void delete(Long id) {
		filterRuleMapper.deleteById(id);
	}

	/**
	 * 判断一条采集请求是否应被过滤掉。
	 *
	 * @param visitorId 访客标识（可空）
	 * @param userAgent User-Agent（可空）
	 * @param clientIp  客户端 IP（可空）
	 * @param path      上报路径（可空）
	 * @return true 表示应丢弃该批次的采集数据
	 */
	public boolean shouldFilter(String visitorId, String userAgent, String clientIp, String path) {
		List<LandingFilterRule> rules = filterRuleMapper.selectList(Wrappers.<LandingFilterRule>lambdaQuery()
			.eq(LandingFilterRule::getEnabled, true));
		if (rules.isEmpty()) {
			return false;
		}
		boolean whitelisted = false;
		for (LandingFilterRule rule : rules) {
			if (!matches(rule, visitorId, userAgent, clientIp, path)) {
				continue;
			}
			if ("INCLUDE".equalsIgnoreCase(rule.getAction())) {
				whitelisted = true;
				continue;
			}
			return true;
		}
		return false;
	}

	private boolean matches(LandingFilterRule rule, String visitorId, String userAgent, String clientIp, String path) {
		String pattern = StrUtil.trimToEmpty(rule.getPattern());
		if (pattern.isEmpty()) {
			return false;
		}
		String type = StrUtil.blankToDefault(rule.getRuleType(), "IP").toUpperCase();
		switch (type) {
			case "IP":
				return clientIp != null && clientIp.equals(pattern);
			case "IP_PREFIX":
				return clientIp != null && clientIp.startsWith(pattern);
			case "UA":
				return userAgent != null && containsIgnoreCase(userAgent, pattern);
			case "VISITOR":
				return visitorId != null && visitorId.equals(pattern);
			case "PATH":
				return path != null && path.startsWith(pattern);
			case "EMAIL_DOMAIN":
				return path != null && path.endsWith("@" + pattern);
			default:
				return false;
		}
	}

	private boolean containsIgnoreCase(String source, String keyword) {
		return source.toLowerCase().contains(keyword.toLowerCase());
	}

	/**
	 * 读取采样率（0-100，非法值按 100 处理）。采样率存放在 landing_setting。
	 */
	public static int normalizeSampleRate(String raw) {
		if (StrUtil.isBlank(raw)) {
			return 100;
		}
		try {
			int value = Integer.parseInt(raw.trim());
			if (value <= 0 || value > 100) {
				return value <= 0 ? 0 : 100;
			}
			return value;
		} catch (NumberFormatException e) {
			return 100;
		}
	}

	/** 判断某个 IP 是否为合法 IPv4/IPv6 形式（仅做宽松校验）。 */
	public static boolean looksLikeIp(String value) {
		if (StrUtil.isBlank(value)) {
			return false;
		}
		if (Pattern.matches("^\\d{1,3}(\\.\\d{1,3}){3}$", value)) {
			return true;
		}
		return value.contains(":");
	}

	private void apply(LandingFilterRule row, LandingFilterRule payload) {
		if (payload.getRuleName() != null) {
			row.setRuleName(StrUtil.sub(payload.getRuleName(), 0, 128));
		}
		if (StrUtil.isNotBlank(payload.getRuleType())) {
			row.setRuleType(StrUtil.sub(payload.getRuleType().toUpperCase(), 0, 16));
		} else if (row.getRuleType() == null) {
			row.setRuleType("IP");
		}
		if (StrUtil.isNotBlank(payload.getPattern())) {
			row.setPattern(StrUtil.sub(payload.getPattern().trim(), 0, 255));
		}
		if (payload.getAction() != null) {
			row.setAction("INCLUDE".equalsIgnoreCase(payload.getAction()) ? "INCLUDE" : "EXCLUDE");
		} else if (row.getAction() == null) {
			row.setAction("EXCLUDE");
		}
		if (payload.getEnabled() != null) {
			row.setEnabled(payload.getEnabled());
		} else if (row.getEnabled() == null) {
			row.setEnabled(true);
		}
		if (payload.getRemark() != null) {
			row.setRemark(StrUtil.sub(payload.getRemark(), 0, 255));
		}
		row.setSiteId(DEFAULT_SITE_ID);
		if (StrUtil.isBlank(row.getPattern())) {
			throw new ServiceException("匹配内容不能为空");
		}
	}
}
