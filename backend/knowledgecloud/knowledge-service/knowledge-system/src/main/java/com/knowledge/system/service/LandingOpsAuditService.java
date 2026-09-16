package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.knowledge.system.domain.LandingOpsAudit;
import com.knowledge.system.mapper.LandingOpsAuditMapper;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * 运营变更审计（P0-3）。
 *
 * <p>所有运营侧写操作都应调用 {@link #record}，让「谁在什么时候改了什么」可追溯。</p>
 */
@Slf4j
@Service
@AllArgsConstructor
public class LandingOpsAuditService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";

	private final LandingOpsAuditMapper auditMapper;

	/**
	 * 记录一条变更。审计失败只记日志，绝不影响主流程。
	 */
	public void record(String operator, Long operatorId, String action, String targetType,
		String targetKey, String summary, String detail, String clientIp) {
		try {
			LandingOpsAudit row = new LandingOpsAudit();
			row.setSiteId(DEFAULT_SITE_ID);
			row.setOperator(StrUtil.sub(operator, 0, 64));
			row.setOperatorId(operatorId);
			row.setAction(StrUtil.sub(action, 0, 64));
			row.setTargetType(StrUtil.sub(targetType, 0, 64));
			row.setTargetKey(StrUtil.sub(targetKey, 0, 255));
			row.setSummary(StrUtil.sub(summary, 0, 512));
			row.setDetail(StrUtil.sub(detail, 0, 60000));
			row.setClientIp(StrUtil.sub(clientIp, 0, 64));
			LocalDateTime now = LocalDateTime.now();
			row.setCreateTime(now);
			row.setUpdateTime(now);
			auditMapper.insert(row);
		} catch (Exception e) {
			log.warn("落地页运营审计写入失败: action={}, target={}:{}", action, targetType, targetKey, e);
		}
	}

	/**
	 * 变更记录分页查询。
	 */
	public IPage<LandingOpsAudit> page(long current, long size, String action, String targetType,
		String operator, String startTime, String endTime) {
		LambdaQueryWrapper<LandingOpsAudit> wrapper = Wrappers.<LandingOpsAudit>lambdaQuery()
			.eq(StrUtil.isNotBlank(action), LandingOpsAudit::getAction, action)
			.eq(StrUtil.isNotBlank(targetType), LandingOpsAudit::getTargetType, targetType)
			.like(StrUtil.isNotBlank(operator), LandingOpsAudit::getOperator, operator)
			.ge(StrUtil.isNotBlank(startTime), LandingOpsAudit::getCreateTime, startTime)
			.le(StrUtil.isNotBlank(endTime), LandingOpsAudit::getCreateTime, endTime)
			.orderByDesc(LandingOpsAudit::getId);
		return auditMapper.selectPage(new Page<>(current, size), wrapper);
	}
}
