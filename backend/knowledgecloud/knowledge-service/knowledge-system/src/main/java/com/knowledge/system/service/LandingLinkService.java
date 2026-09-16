package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingLink;
import com.knowledge.system.domain.LandingLinkClick;
import com.knowledge.system.domain.dto.LandingLinkDTO;
import com.knowledge.system.mapper.LandingLinkClickMapper;
import com.knowledge.system.mapper.LandingLinkMapper;
import com.knowledge.system.util.LandingUserAgent;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 落地页渠道短链服务
 */
@Service
@AllArgsConstructor
public class LandingLinkService {

	private final LandingLinkMapper linkMapper;
	private final LandingLinkClickMapper clickMapper;

	/**
	 * 解析短链并记录点击，返回带 UTM 的目标地址。
	 */
	@Transactional(rollbackFor = Exception.class)
	public String resolve(String slug, String referrer, String userAgent, String clientIp) {
		LandingLink link = linkMapper.selectOne(Wrappers.<LandingLink>lambdaQuery()
			.eq(LandingLink::getSlug, slug)
			.eq(LandingLink::getEnabled, true)
			.last("LIMIT 1"));
		if (link == null) {
			throw new ServiceException("短链不存在或已停用");
		}
		if (!isHttpUrl(link.getTarget())) {
			throw new ServiceException("短链目标地址非法");
		}

		LocalDateTime now = LocalDateTime.now();
		link.setClicks((link.getClicks() == null ? 0 : link.getClicks()) + 1);
		link.setUpdateTime(now);
		linkMapper.updateById(link);

		LandingLinkClick click = new LandingLinkClick();
		click.setSlug(slug);
		click.setReferrer(StrUtil.sub(referrer, 0, 512));
		click.setUa(StrUtil.sub(userAgent, 0, 256));
		click.setIpHash(clientIp == null ? null : StrUtil.sub(LandingUserAgent.sha256("kotion-landing:" + clientIp), 0, 32));
		click.setStatDay(LocalDate.now());
		click.setCreateTime(now);
		click.setUpdateTime(now);
		clickMapper.insert(click);

		return appendUtm(link.getTarget(), link);
	}

	public List<LandingLink> list() {
		return linkMapper.selectList(Wrappers.<LandingLink>lambdaQuery()
			.orderByDesc(LandingLink::getCreateTime));
	}

	public LandingLink create(LandingLinkDTO dto) {
		LandingLink row = new LandingLink();
		apply(row, dto);
		if (StrUtil.isBlank(row.getSlug())) {
			row.setSlug("l-" + Long.toHexString(System.nanoTime()));
		}
		if (linkMapper.selectCount(Wrappers.<LandingLink>lambdaQuery()
			.eq(LandingLink::getSlug, row.getSlug())) > 0) {
			throw new ServiceException("短链标识已存在：" + row.getSlug());
		}
		row.setClicks(0);
		LocalDateTime now = LocalDateTime.now();
		row.setCreateTime(now);
		row.setUpdateTime(now);
		linkMapper.insert(row);
		return row;
	}

	public LandingLink update(Long id, LandingLinkDTO dto) {
		LandingLink row = linkMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("短链不存在");
		}
		apply(row, dto);
		row.setUpdateTime(LocalDateTime.now());
		linkMapper.updateById(row);
		return row;
	}

	public void delete(Long id) {
		linkMapper.deleteById(id);
	}

	/**
	 * 按天统计某短链点击。
	 */
	public List<Map<String, Object>> dailyClicks(String slug, int days) {
		LocalDate from = LocalDate.now().minusDays(days - 1L);
		List<LandingLinkClick> clicks = clickMapper.selectList(Wrappers.<LandingLinkClick>lambdaQuery()
			.eq(LandingLinkClick::getSlug, slug)
			.ge(LandingLinkClick::getStatDay, from));
		Map<String, Long> byDay = new LinkedHashMap<>();
		for (int i = days - 1; i >= 0; i--) {
			byDay.put(LocalDate.now().minusDays(i).toString(), 0L);
		}
		for (LandingLinkClick click : clicks) {
			String key = String.valueOf(click.getStatDay());
			byDay.merge(key, 1L, Long::sum);
		}
		List<Map<String, Object>> result = new java.util.ArrayList<>();
		for (Map.Entry<String, Long> entry : byDay.entrySet()) {
			Map<String, Object> item = new LinkedHashMap<>();
			item.put("date", entry.getKey());
			item.put("clicks", entry.getValue());
			result.add(item);
		}
		return result;
	}

	private void apply(LandingLink row, LandingLinkDTO dto) {
		if (StrUtil.isNotBlank(dto.getSlug())) {
			row.setSlug(StrUtil.sub(dto.getSlug().toLowerCase().replaceAll("[^a-z0-9_-]", "-"), 0, 64));
		}
		if (StrUtil.isNotBlank(dto.getTarget())) {
			if (!isHttpUrl(dto.getTarget())) {
				throw new ServiceException("目标地址必须是 http(s) 链接");
			}
			row.setTarget(StrUtil.sub(dto.getTarget(), 0, 512));
		}
		if (dto.getLabel() != null) {
			row.setLabel(StrUtil.sub(dto.getLabel(), 0, 128));
		}
		if (dto.getChannel() != null) {
			row.setChannel(StrUtil.sub(dto.getChannel(), 0, 64));
		}
		if (dto.getEnabled() != null) {
			row.setEnabled(dto.getEnabled());
		}
		if (dto.getUtm() != null) {
			row.setUtmSource(StrUtil.sub(dto.getUtm().get("source"), 0, 128));
			row.setUtmMedium(StrUtil.sub(dto.getUtm().get("medium"), 0, 128));
			row.setUtmCampaign(StrUtil.sub(dto.getUtm().get("campaign"), 0, 128));
			row.setUtmContent(StrUtil.sub(dto.getUtm().get("content"), 0, 128));
		}
		if (row.getTarget() == null) {
			throw new ServiceException("目标地址不能为空");
		}
	}

	private boolean isHttpUrl(String value) {
		return value != null && (value.startsWith("http://") || value.startsWith("https://"));
	}

	private String appendUtm(String target, LandingLink link) {
		Map<String, String> params = new LinkedHashMap<>();
		params.put("utm_source", link.getUtmSource());
		params.put("utm_medium", link.getUtmMedium());
		params.put("utm_campaign", link.getUtmCampaign());
		params.put("utm_content", link.getUtmContent());
		StringBuilder sb = new StringBuilder(target);
		boolean first = target.indexOf('?') < 0;
		for (Map.Entry<String, String> entry : params.entrySet()) {
			if (StrUtil.isBlank(entry.getValue())) {
				continue;
			}
			sb.append(first ? '?' : '&');
			first = false;
			sb.append(entry.getKey()).append('=').append(urlEncode(entry.getValue()));
		}
		return sb.toString();
	}

	private String urlEncode(String value) {
		try {
			return URLEncoder.encode(value, "UTF-8");
		} catch (UnsupportedEncodingException e) {
			return value;
		}
	}
}
