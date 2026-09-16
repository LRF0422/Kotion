package com.knowledge.system.controller;

import com.knowledge.core.boot.ctrl.KnowledgeController;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.system.service.LandingContentExtService;
import com.knowledge.system.service.LandingOpsAuditService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.AllArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 文案 CMS 扩展接口（P1-5）：一键导入 / 覆盖率 / 预览令牌。
 *
 * <p>与既有的 {@link AdminLandingOpsController} 共用 `/admin/ops/content` 前缀，
 * 但方法路径不重叠（导入与覆盖率都是 POST 子路径，不会命中 `GET/PUT /content/{key}`）。</p>
 */
@RestController
@AllArgsConstructor
@RequestMapping("/admin/ops/content")
@PreAuthorize("(hasRole('platform.landing.read') or hasRole('platform.dashboard.read') or "
	+ RoleConstant.HAS_ROLE_ADMIN + ") and principal.clientId == 'kotion-platform-admin'")
@Api(value = "落地页文案扩展", tags = "落地页文案扩展")
public class LandingOpsContentExtController extends KnowledgeController {

	private static final String WRITE_AUTH = "(hasRole('platform.landing.manage') or "
		+ "hasRole('platform.settings.manage') or " + RoleConstant.HAS_ROLE_ADMIN
		+ ") and principal.clientId == 'kotion-platform-admin'";

	private final LandingContentExtService contentExtService;
	private final LandingOpsAuditService auditService;

	@PostMapping("/import")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "从键值对一键导入草稿")
	@SuppressWarnings("unchecked")
	public R<Map<String, Object>> importEntries(@RequestBody Map<String, Object> body) {
		String locale = String.valueOf(body.getOrDefault("locale", "zh"));
		boolean overwrite = Boolean.parseBoolean(String.valueOf(body.getOrDefault("overwrite", false)));
		Map<String, String> entries = new LinkedHashMap<>();
		Object raw = body.get("entries");
		if (raw instanceof Map) {
			for (Map.Entry<String, Object> entry : ((Map<String, Object>) raw).entrySet()) {
				if (entry.getValue() != null) {
					entries.put(entry.getKey(), String.valueOf(entry.getValue()));
				}
			}
		}
		Map<String, Object> result = contentExtService.importEntries(locale, entries, overwrite);
		auditService.record(operator(body.get("by")), null, "IMPORT", "CONTENT", locale,
			"导入文案 " + result.get("imported") + " 条（语言 " + locale + "）",
			null, clientIp());
		return R.data(result);
	}

	@PostMapping("/coverage")
	@ApiOperation(value = "文案覆盖率")
	@SuppressWarnings("unchecked")
	public R<Map<String, Object>> coverage(@RequestBody Map<String, Object> body) {
		String locale = String.valueOf(body.getOrDefault("locale", "zh"));
		List<String> keys = new ArrayList<>();
		Object raw = body.get("keys");
		if (raw instanceof List) {
			for (Object item : (List<Object>) raw) {
				if (item != null) {
					keys.add(String.valueOf(item));
				}
			}
		}
		return R.data(contentExtService.coverage(locale, keys));
	}

	@PostMapping("/preview-token")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "生成草稿预览令牌")
	public R<Map<String, Object>> previewToken(@RequestBody Map<String, Object> body) {
		String locale = String.valueOf(body.getOrDefault("locale", "zh"));
		Integer ttl = body.get("ttlMinutes") == null ? null : Integer.valueOf(String.valueOf(body.get("ttlMinutes")));
		String origin = body.get("origin") == null ? null : String.valueOf(body.get("origin"));
		Map<String, Object> result = contentExtService.createPreviewToken(locale, ttl, origin);
		auditService.record(operator(body.get("by")), null, "PREVIEW_TOKEN", "CONTENT", locale,
			"生成文案预览令牌（语言 " + locale + "）", null, clientIp());
		return R.data(result);
	}

	private String operator(Object by) {
		if (by != null && !String.valueOf(by).trim().isEmpty()) {
			return String.valueOf(by);
		}
		if (getUser() != null) {
			String name = getUser().getUserName();
			if (name == null || name.trim().isEmpty()) {
				name = getUser().getAccount();
			}
			if (name != null && !name.trim().isEmpty()) {
				return name;
			}
		}
		return "admin";
	}

	private String clientIp() {
		try {
			return com.knowledge.core.tool.utils.WebUtil.getIP(getRequest());
		} catch (Exception e) {
			return null;
		}
	}
}
