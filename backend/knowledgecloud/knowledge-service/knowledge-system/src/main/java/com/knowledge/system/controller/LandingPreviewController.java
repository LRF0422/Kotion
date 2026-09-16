package com.knowledge.system.controller;

import cn.hutool.core.util.StrUtil;
import com.knowledge.core.boot.ctrl.KnowledgeController;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.service.LandingContentExtService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.AllArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 文案草稿预览（P1-5 的公开读端）。
 *
 * <p>需要携带后台签发的预览令牌（`POST /admin/ops/content/preview-token`）。
 * 未携带或签名不匹配一律按未授权处理，**不会**回退到已发布内容，
 * 避免预览接口变成绕过发布的读取通道。</p>
 */
@RestController
@AllArgsConstructor
@RequestMapping("/ops/preview")
@Api(value = "落地页文案预览", tags = "落地页文案预览")
public class LandingPreviewController extends KnowledgeController {

	private final LandingContentExtService contentExtService;

	@GetMapping("/content")
	@ApiOperation(value = "按令牌读取草稿文案")
	public R<Map<String, Object>> draftContent(@RequestParam("token") String token,
		@RequestParam(value = "locale", required = false) String locale) {
		String tokenLocale = contentExtService.verifyPreviewToken(token);
		if (StrUtil.isBlank(tokenLocale)) {
			return R.fail("预览令牌无效或已过期");
		}
		String target = StrUtil.blankToDefault(locale, tokenLocale);
		return R.data(contentExtService.draftPayloads(target));
	}
}
