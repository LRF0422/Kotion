package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingSubscriber;
import com.knowledge.system.domain.dto.LandingSubscribeDTO;
import com.knowledge.system.mapper.LandingSubscriberMapper;
import com.knowledge.system.util.LandingUserAgent;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 落地页订阅线索服务
 */
@Service
@AllArgsConstructor
public class LandingSubscribeService {

	private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");
	private static final String STATUS_SUBSCRIBED = "subscribed";

	private final LandingSubscriberMapper subscriberMapper;

	public String subscribe(LandingSubscribeDTO dto, String clientIp) {
		String email = StrUtil.trim(dto.getEmail());
		if (email == null || !EMAIL.matcher(email).matches()) {
			throw new ServiceException("邮箱格式不正确");
		}
		email = email.toLowerCase();
		Map<String, String> utm = dto.getUtm() == null ? java.util.Collections.emptyMap() : dto.getUtm();
		LocalDateTime now = LocalDateTime.now();

		LandingSubscriber existing = subscriberMapper.selectOne(Wrappers.<LandingSubscriber>lambdaQuery()
			.eq(LandingSubscriber::getEmail, email)
			.last("LIMIT 1"));
		if (existing != null) {
			existing.setStatus(STATUS_SUBSCRIBED);
			existing.setUpdateTime(now);
			subscriberMapper.updateById(existing);
			return email;
		}

		LandingSubscriber row = new LandingSubscriber();
		row.setEmail(email);
		row.setStatus(STATUS_SUBSCRIBED);
		row.setSourcePath(StrUtil.sub(dto.getSourcePath(), 0, 255));
		row.setReferrer(StrUtil.sub(dto.getReferrer(), 0, 512));
		row.setUtmSource(StrUtil.sub(utm.get("source"), 0, 128));
		row.setUtmMedium(StrUtil.sub(utm.get("medium"), 0, 128));
		row.setUtmCampaign(StrUtil.sub(utm.get("campaign"), 0, 128));
		row.setIpHash(clientIp == null ? null : StrUtil.sub(LandingUserAgent.sha256("kotion-landing:" + clientIp), 0, 32));
		row.setCreateTime(now);
		row.setUpdateTime(now);
		subscriberMapper.insert(row);
		return email;
	}

	public IPage<LandingSubscriber> page(long current, long size, String status, String search) {
		LambdaQueryWrapper<LandingSubscriber> wrapper = Wrappers.<LandingSubscriber>lambdaQuery()
			.eq(StrUtil.isNotBlank(status), LandingSubscriber::getStatus, status)
			.and(StrUtil.isNotBlank(search), w -> w
				.like(LandingSubscriber::getEmail, search)
				.or()
				.like(LandingSubscriber::getNote, search))
			.orderByDesc(LandingSubscriber::getCreateTime);
		return subscriberMapper.selectPage(new Page<>(current, size), wrapper);
	}

	public void update(Long id, String status, String note) {
		LandingSubscriber row = subscriberMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("订阅记录不存在");
		}
		if (StrUtil.isNotBlank(status)) {
			row.setStatus(status);
		}
		if (note != null) {
			row.setNote(StrUtil.sub(note, 0, 255));
		}
		row.setUpdateTime(LocalDateTime.now());
		subscriberMapper.updateById(row);
	}

	public void delete(Long id) {
		subscriberMapper.deleteById(id);
	}

	/**
	 * 导出 CSV（带 BOM，便于 Excel 直接打开）。
	 */
	public String exportCsv() {
		List<LandingSubscriber> rows = subscriberMapper.selectList(Wrappers.<LandingSubscriber>lambdaQuery()
			.orderByDesc(LandingSubscriber::getCreateTime));
		DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
		String[] header = {"email", "status", "source_path", "referrer", "utm_source", "utm_medium", "utm_campaign", "note", "create_time"};
		StringBuilder sb = new StringBuilder("﻿");
		sb.append(String.join(",", header)).append('\n');
		for (LandingSubscriber row : rows) {
			String[] cells = {
				row.getEmail(), row.getStatus(), row.getSourcePath(), row.getReferrer(),
				row.getUtmSource(), row.getUtmMedium(), row.getUtmCampaign(), row.getNote(),
				row.getCreateTime() == null ? "" : row.getCreateTime().format(formatter),
			};
			for (int i = 0; i < cells.length; i++) {
				if (i > 0) {
					sb.append(',');
				}
				sb.append(csvCell(cells[i]));
			}
			sb.append('\n');
		}
		return sb.toString();
	}

	private String csvCell(String value) {
		if (value == null) {
			return "";
		}
		if (value.indexOf(',') >= 0 || value.indexOf('"') >= 0 || value.indexOf('\n') >= 0) {
			return '"' + value.replace("\"", "\"\"") + '"';
		}
		return value;
	}
}
