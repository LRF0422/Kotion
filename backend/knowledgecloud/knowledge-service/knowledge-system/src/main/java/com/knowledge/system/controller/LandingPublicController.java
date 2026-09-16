package com.knowledge.system.controller;

import cn.hutool.core.util.StrUtil;
import com.knowledge.core.boot.ctrl.KnowledgeController;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.domain.LandingChangelog;
import com.knowledge.system.domain.dto.LandingCollectDTO;
import com.knowledge.system.domain.dto.LandingSubscribeDTO;
import com.knowledge.system.service.LandingChangelogService;
import com.knowledge.system.service.LandingCollectService;
import com.knowledge.system.service.LandingContentService;
import com.knowledge.system.service.LandingLinkService;
import com.knowledge.system.service.LandingSettingService;
import com.knowledge.system.service.LandingSubscribeService;
import com.knowledge.system.util.LandingUserAgent;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.AllArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 落地页公开接口（无需登录，网关放行 /ops/**）
 */
@RestController
@AllArgsConstructor
@RequestMapping("/ops")
@Api(value = "落地页公开接口", tags = "落地页公开接口")
public class LandingPublicController extends KnowledgeController {

	private final LandingCollectService landingCollectService;
	private final LandingContentService landingContentService;
	private final LandingSubscribeService landingSubscribeService;
	private final LandingLinkService landingLinkService;
	private final LandingChangelogService landingChangelogService;
	private final LandingSettingService landingSettingService;

	/**
	 * 埋点批量上报
	 */
	@PostMapping("/collect")
	@ApiOperation(value = "埋点上报", notes = "落地页批量上报 pageview 与自定义事件")
	public R<Map<String, Object>> collect(@RequestBody LandingCollectDTO dto, HttpServletRequest request) {
		Map<String, Object> result = new HashMap<>(2);
		String ua = request.getHeader("User-Agent");
		if (LandingUserAgent.isBot(ua)) {
			result.put("accepted", 0);
			result.put("skipped", "bot");
			return R.data(result);
		}
		if ("1".equals(request.getHeader("DNT")) || "1".equals(request.getHeader("Sec-GPC"))) {
			result.put("accepted", 0);
			result.put("skipped", "dnt");
			return R.data(result);
		}
		String ip = LandingUserAgent.clientIp(
			request.getHeader("X-Forwarded-For"),
			request.getHeader("X-Real-IP"),
			request.getRemoteAddr());
		result.put("accepted", landingCollectService.collect(dto, ua, ip));
		return R.data(result);
	}

	/**
	 * 全部已发布文案
	 */
	@GetMapping("/content")
	@ApiOperation(value = "已发布文案", notes = "一次性读取某语言下全部已发布内容")
	public R<Map<String, Object>> content(@RequestParam(value = "locale", defaultValue = "zh") String locale) {
		return R.data(landingContentService.publishedPayloads(normalizeLocale(locale)));
	}

	/**
	 * 单个内容键
	 */
	@GetMapping("/content/{key}")
	@ApiOperation(value = "单条文案")
	public R<Object> contentByKey(@PathVariable("key") String key,
		@RequestParam(value = "locale", defaultValue = "zh") String locale) {
		return R.data(landingContentService.published(key, normalizeLocale(locale)));
	}

	/**
	 * 订阅更新
	 */
	@PostMapping("/subscribe")
	@ApiOperation(value = "订阅更新")
	public R<Map<String, Object>> subscribe(@RequestBody LandingSubscribeDTO dto, HttpServletRequest request) {
		String ip = LandingUserAgent.clientIp(
			request.getHeader("X-Forwarded-For"),
			request.getHeader("X-Real-IP"),
			request.getRemoteAddr());
		String email = landingSubscribeService.subscribe(dto, ip);
		Map<String, Object> result = new HashMap<>(2);
		result.put("email", email);
		return R.data(result);
	}

	/**
	 * 渠道短链跳转
	 */
	@GetMapping("/go/{slug}")
	@ApiOperation(value = "渠道短链跳转")
	public void go(@PathVariable("slug") String slug, HttpServletRequest request, HttpServletResponse response)
		throws IOException {
		String ip = LandingUserAgent.clientIp(
			request.getHeader("X-Forwarded-For"),
			request.getHeader("X-Real-IP"),
			request.getRemoteAddr());
		String target = landingLinkService.resolve(slug, request.getHeader("Referer"),
			request.getHeader("User-Agent"), ip);
		response.sendRedirect(target);
	}

	/**
	 * 更新日志
	 */
	@GetMapping("/changelog")
	@ApiOperation(value = "更新日志")
	public R<List<LandingChangelog>> changelog(@RequestParam(value = "limit", defaultValue = "20") Integer limit) {
		return R.data(landingChangelogService.list(limit == null ? 20 : limit));
	}

	/**
	 * 公开设置（SEO / 社交）
	 */
	@GetMapping("/settings")
	@ApiOperation(value = "公开设置")
	public R<Map<String, String>> settings() {
		return R.data(landingSettingService.publicSettings());
	}

	private String normalizeLocale(String locale) {
		String value = StrUtil.blankToDefault(locale, "zh");
		if (!"zh".equals(value) && !"en".equals(value)) {
			throw new ServiceException("不支持的语言：" + value);
		}
		return value;
	}
}
