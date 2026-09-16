package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingReferral;
import com.knowledge.system.mapper.LandingReferralMapper;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 推荐 / 邀请码（P2-7）。
 *
 * <p>推荐码只做三件事：管理端维护、公开端跳转计数、产品端回传注册与激活。
 * 跳转记录写入 {@code clicks}，注册/激活由产品侧在完成动作后回调计数。</p>
 */
@Service
@AllArgsConstructor
public class LandingReferralService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";
	private static final String CODE_PATTERN = "[^a-z0-9-]";

	private final LandingReferralMapper referralMapper;

	public List<LandingReferral> list() {
		return referralMapper.selectList(Wrappers.<LandingReferral>lambdaQuery()
			.eq(LandingReferral::getSiteId, DEFAULT_SITE_ID)
			.orderByDesc(LandingReferral::getId));
	}

	public Map<String, Object> create(Map<String, Object> body) {
		LandingReferral row = new LandingReferral();
		row.setSiteId(DEFAULT_SITE_ID);
		apply(row, body, true);
		long exists = referralMapper.selectCount(Wrappers.<LandingReferral>lambdaQuery()
			.eq(LandingReferral::getCode, row.getCode()));
		if (exists > 0) {
			throw new ServiceException("邀请码已存在：" + row.getCode());
		}
		row.setClicks(0);
		row.setSignups(0);
		row.setActivations(0);
		LocalDateTime now = LocalDateTime.now();
		row.setCreateTime(now);
		row.setUpdateTime(now);
		referralMapper.insert(row);
		return toMap(row);
	}

	public Map<String, Object> update(Long id, Map<String, Object> body) {
		LandingReferral row = referralMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("邀请码不存在");
		}
		apply(row, body, false);
		long exists = referralMapper.selectCount(Wrappers.<LandingReferral>lambdaQuery()
			.eq(LandingReferral::getCode, row.getCode())
			.ne(LandingReferral::getId, id));
		if (exists > 0) {
			throw new ServiceException("邀请码已存在：" + row.getCode());
		}
		row.setUpdateTime(LocalDateTime.now());
		referralMapper.updateById(row);
		return toMap(row);
	}

	public void delete(Long id) {
		referralMapper.deleteById(id);
	}

	/**
	 * 公开跳转：命中启用中的邀请码则点击数 +1 并返回目标地址。
	 *
	 * <p>{@code ?ref=&lt;code&gt;} 由配置方直接写在 target 里，服务端不做拼接。
	 * 公开接口不写审计，避免污染变更记录。</p>
	 *
	 * @param referrer  来源页（预留，用于后续归因）
	 * @param userAgent User-Agent（预留）
	 * @param clientIp  客户端 IP（预留）
	 */
	@Transactional(rollbackFor = Exception.class)
	public String resolve(String code, String referrer, String userAgent, String clientIp) {
		if (StrUtil.isBlank(code)) {
			throw new ServiceException("邀请码不存在或已停用");
		}
		LandingReferral row = referralMapper.selectOne(Wrappers.<LandingReferral>lambdaQuery()
			.eq(LandingReferral::getCode, code.trim())
			.eq(LandingReferral::getEnabled, true)
			.last("LIMIT 1"));
		if (row == null) {
			throw new ServiceException("邀请码不存在或已停用");
		}
		row.setClicks((row.getClicks() == null ? 0 : row.getClicks()) + 1);
		row.setUpdateTime(LocalDateTime.now());
		referralMapper.updateById(row);
		return row.getTarget();
	}

	public void recordSignup(String code) {
		increment(code, true);
	}

	public void recordActivation(String code) {
		increment(code, false);
	}

	private void increment(String code, boolean signup) {
		if (StrUtil.isBlank(code)) {
			return;
		}
		LandingReferral row = referralMapper.selectOne(Wrappers.<LandingReferral>lambdaQuery()
			.eq(LandingReferral::getCode, code.trim())
			.last("LIMIT 1"));
		if (row == null) {
			return;
		}
		if (signup) {
			row.setSignups((row.getSignups() == null ? 0 : row.getSignups()) + 1);
		} else {
			row.setActivations((row.getActivations() == null ? 0 : row.getActivations()) + 1);
		}
		row.setUpdateTime(LocalDateTime.now());
		referralMapper.updateById(row);
	}

	private Map<String, Object> toMap(LandingReferral row) {
		Map<String, Object> item = new LinkedHashMap<>(12);
		item.put("id", row.getId());
		item.put("code", row.getCode());
		item.put("ownerType", row.getOwnerType());
		item.put("ownerId", row.getOwnerId());
		item.put("ownerName", row.getOwnerName());
		item.put("target", row.getTarget());
		item.put("clicks", row.getClicks());
		item.put("signups", row.getSignups());
		item.put("activations", row.getActivations());
		item.put("enabled", row.getEnabled());
		item.put("createTime", row.getCreateTime());
		item.put("updateTime", row.getUpdateTime());
		return item;
	}

	private void apply(LandingReferral row, Map<String, Object> body, boolean creating) {
		Map<String, Object> safe = body == null ? new LinkedHashMap<String, Object>() : body;
		if (creating || StrUtil.isNotBlank(stringValue(safe.get("code")))) {
			String code = slug(stringValue(safe.get("code")));
			if (code.isEmpty()) {
				throw new ServiceException("邀请码不能为空");
			}
			row.setCode(StrUtil.sub(code, 0, 32));
		}
		if (safe.get("ownerType") != null) {
			row.setOwnerType(normalizeOwnerType(stringValue(safe.get("ownerType"))));
		} else if (row.getOwnerType() == null) {
			row.setOwnerType("USER");
		}
		if (safe.get("ownerId") != null) {
			row.setOwnerId(StrUtil.sub(stringValue(safe.get("ownerId")), 0, 64));
		}
		if (safe.get("ownerName") != null) {
			row.setOwnerName(StrUtil.sub(stringValue(safe.get("ownerName")), 0, 128));
		}
		if (creating || safe.get("target") != null) {
			String target = StrUtil.trimToEmpty(stringValue(safe.get("target")));
			if (target.isEmpty()) {
				throw new ServiceException("目标地址不能为空");
			}
			if (!target.startsWith("http://") && !target.startsWith("https://") && !target.startsWith("/")) {
				throw new ServiceException("目标地址必须以 http(s):// 或 / 开头");
			}
			row.setTarget(StrUtil.sub(target, 0, 512));
		}
		if (safe.get("enabled") != null) {
			row.setEnabled(Boolean.valueOf(stringValue(safe.get("enabled"))));
		} else if (row.getEnabled() == null) {
			row.setEnabled(Boolean.TRUE);
		}
		if (StrUtil.isBlank(row.getCode()) || StrUtil.isBlank(row.getTarget())) {
			throw new ServiceException("邀请码与目标地址不能为空");
		}
	}

	private static String normalizeOwnerType(String raw) {
		String value = StrUtil.trimToEmpty(raw).toUpperCase();
		if ("PARTNER".equals(value) || "CAMPAIGN".equals(value)) {
			return value;
		}
		return "USER";
	}

	/** 归一化为 [a-z0-9-]，连续分隔符合并为一个连字符。 */
	private static String slug(String raw) {
		String value = StrUtil.trimToEmpty(raw).toLowerCase().replaceAll(CODE_PATTERN, "-");
		return value.replaceAll("-{2,}", "-").replaceAll("^-+", "").replaceAll("-+$", "");
	}

	private static String stringValue(Object value) {
		return value == null ? "" : String.valueOf(value);
	}
}
