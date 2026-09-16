package com.knowledge.system.controller;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.boot.ctrl.KnowledgeController;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.domain.LandingEvent;
import com.knowledge.system.domain.LandingResource;
import com.knowledge.system.domain.LandingSubscriber;
import com.knowledge.system.mapper.LandingEventMapper;
import com.knowledge.system.mapper.LandingResourceMapper;
import com.knowledge.system.mapper.LandingSubscriberMapper;
import com.knowledge.system.service.LandingCampaignService;
import com.knowledge.system.service.LandingExperimentService;
import com.knowledge.system.service.LandingReferralService;
import com.knowledge.system.service.LandingResourceService;
import com.knowledge.system.util.LandingUserAgent;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.AllArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 落地页运营公开扩展接口（P1/P2，无需登录，网关放行 /ops/**）。
 *
 * <p>承载投放页配置下发、实验曝光、推荐码跳转、邮件打开/点击追踪、
 * 退订与双重确认、sitemap 以及跨域旅程上报。</p>
 */
@RestController
@AllArgsConstructor
@RequestMapping("/ops")
@Api(value = "落地页公开扩展接口", tags = "落地页公开扩展接口")
public class LandingOpsPublicExtController extends KnowledgeController {

	private static final String DEFAULT_SITE_ID = "kotion-landing";
	/** 站点主域，用于 sitemap 与邮件里的绝对地址。 */
	private static final String SITE_ORIGIN = "https://kotion.top";
	/** 英文站点挂在 /en 前缀下（与前端路由约定一致）。 */
	private static final String EN_PREFIX = "/en";
	private static final List<String> STATIC_ROUTES = Arrays.asList(
		"/", "/templates", "/plugins", "/doc", "/changelog");

	/** 1×1 透明 GIF，用于邮件打开像素。 */
	private static final byte[] TRANSPARENT_GIF = Base64.getDecoder()
		.decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");

	private final LandingResourceService resourceService;
	private final LandingExperimentService experimentService;
	private final LandingCampaignService campaignService;
	private final LandingReferralService referralService;
	private final LandingEventMapper eventMapper;
	private final LandingSubscriberMapper subscriberMapper;
	private final LandingResourceMapper resourceMapper;

	// ---------- 配置下发 ----------

	@GetMapping("/config")
	@ApiOperation(value = "公开配置包")
	public R<Map<String, Object>> config(@RequestParam(value = "locale", defaultValue = "zh") String locale) {
		return R.data(resourceService.publicBundle(locale));
	}

	@GetMapping("/page/{slug}")
	@ApiOperation(value = "投放页")
	public R<Map<String, Object>> page(@PathVariable("slug") String slug,
		@RequestParam(value = "locale", defaultValue = "zh") String locale) {
		Map<String, Object> result = resourceService.publicPage(slug, locale);
		if (result == null) {
			return R.fail("投放页不存在");
		}
		return R.data(result);
	}

	// ---------- 实验 ----------

	@GetMapping("/experiments")
	@ApiOperation(value = "运行中的实验")
	public R<List<Map<String, Object>>> experiments() {
		return R.data(experimentService.running());
	}

	@PostMapping("/exposure")
	@ApiOperation(value = "登记实验曝光")
	public R<Void> exposure(@RequestBody Map<String, Object> body) {
		experimentService.recordExposure(stringValue(body, "expKey"), stringValue(body, "variantKey"),
			stringValue(body, "visitorId"), stringValue(body, "sessionId"));
		return R.success("记录成功");
	}

	@PostMapping("/exposure/conversion")
	@ApiOperation(value = "登记实验转化")
	public R<Void> exposureConversion(@RequestBody Map<String, Object> body) {
		experimentService.recordConversion(stringValue(body, "expKey"), stringValue(body, "visitorId"),
			stringValue(body, "metric"));
		return R.success("记录成功");
	}

	// ---------- 推荐码 ----------

	@GetMapping("/r/{code}")
	@ApiOperation(value = "邀请码跳转")
	public void referral(@PathVariable("code") String code, HttpServletRequest request,
		HttpServletResponse response) throws IOException {
		String ip = LandingUserAgent.clientIp(
			request.getHeader("X-Forwarded-For"),
			request.getHeader("X-Real-IP"),
			request.getRemoteAddr());
		String target = referralService.resolve(code, request.getHeader("Referer"),
			request.getHeader("User-Agent"), ip);
		response.sendRedirect(target);
	}

	// ---------- 退订 / 确认 ----------

	@GetMapping("/unsubscribe")
	@ApiOperation(value = "退订")
	public ResponseEntity<String> unsubscribe(@RequestParam(value = "token", required = false) String token) {
		return plainText(campaignService.unsubscribe(token));
	}

	@GetMapping("/confirm")
	@ApiOperation(value = "双重确认订阅")
	public ResponseEntity<String> confirm(@RequestParam(value = "token", required = false) String token) {
		String value = StrUtil.trimToEmpty(token);
		if (value.isEmpty()) {
			return plainText("确认链接无效");
		}
		LandingSubscriber subscriber = subscriberMapper.selectOne(Wrappers.<LandingSubscriber>lambdaQuery()
			.eq(LandingSubscriber::getConfirmToken, value)
			.last("LIMIT 1"));
		if (subscriber == null) {
			return plainText("确认链接无效");
		}
		LocalDateTime now = LocalDateTime.now();
		subscriber.setStatus("subscribed");
		subscriber.setConfirmedAt(now);
		subscriber.setUpdateTime(now);
		subscriberMapper.updateById(subscriber);
		return plainText("订阅已确认");
	}

	// ---------- 邮件追踪 ----------

	@GetMapping("/campaign/open/{trackingId}")
	@ApiOperation(value = "打开像素")
	public void campaignOpen(@PathVariable("trackingId") String trackingId, HttpServletResponse response)
		throws IOException {
		campaignService.trackOpen(trackingId);
		response.setContentType("image/gif");
		response.setHeader("Cache-Control", "no-store");
		response.setContentLength(TRANSPARENT_GIF.length);
		response.getOutputStream().write(TRANSPARENT_GIF);
		response.getOutputStream().flush();
	}

	@GetMapping("/campaign/click/{trackingId}")
	@ApiOperation(value = "点击跳转")
	public void campaignClick(@PathVariable("trackingId") String trackingId,
		@RequestParam(value = "url", required = false) String url, HttpServletResponse response)
		throws IOException {
		campaignService.trackClick(trackingId);
		String target = StrUtil.trimToEmpty(url);
		if (!target.startsWith("http://") && !target.startsWith("https://")) {
			target = "/";
		}
		response.sendRedirect(target);
	}

	// ---------- sitemap ----------

	/**
	 * 由 SEO 资源行 + 静态路由生成 sitemap，每条给出 zh-CN / en / x-default 三种 alternates。
	 *
	 * <p>英文站点按 {@value #EN_PREFIX} 前缀推导，若前端路由约定变化需要同步修改。</p>
	 */
	@GetMapping(value = "/sitemap.xml", produces = "application/xml;charset=UTF-8")
	@ApiOperation(value = "sitemap")
	public ResponseEntity<String> sitemap() {
		List<LandingResource> seoRows = resourceMapper.selectList(Wrappers.<LandingResource>lambdaQuery()
			.eq(LandingResource::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingResource::getResKind, "SEO")
			.eq(LandingResource::getStatus, "PUBLISHED")
			.eq(LandingResource::getEnabled, true)
			.orderByAsc(LandingResource::getId));
		Set<String> paths = new LinkedHashSet<>(STATIC_ROUTES);
		for (LandingResource row : seoRows) {
			String path = StrUtil.trimToEmpty(row.getResKey());
			if (!path.isEmpty()) {
				paths.add(path);
			}
		}

		StringBuilder xml = new StringBuilder();
		xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
		xml.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\" ")
			.append("xmlns:xhtml=\"http://www.w3.org/1999/xhtml\">");
		for (String path : paths) {
			String zh = SITE_ORIGIN + path;
			String en = SITE_ORIGIN + EN_PREFIX + ("/".equals(path) ? "/" : path);
			xml.append("<url>");
			xml.append("<loc>").append(escapeXml(zh)).append("</loc>");
			appendAlternate(xml, "zh-CN", zh);
			appendAlternate(xml, "en", en);
			appendAlternate(xml, "x-default", zh);
			xml.append("</url>");
		}
		xml.append("</urlset>");
		return ResponseEntity.ok()
			.contentType(new MediaType("application", "xml", StandardCharsets.UTF_8))
			.body(xml.toString());
	}

	// ---------- 跨域旅程 ----------

	/**
	 * 产品端回传的跨域旅程事件（P2-3）：只接受 signup / activated。
	 */
	@SuppressWarnings("unchecked")
	@PostMapping("/journey")
	@ApiOperation(value = "跨域旅程上报")
	public R<Void> journey(@RequestBody Map<String, Object> body) {
		String visitorId = stringValue(body, "visitorId");
		String step = stringValue(body, "step");
		if (StrUtil.isBlank(visitorId) || StrUtil.isBlank(step)) {
			return R.fail("visitorId 与 step 不能为空");
		}
		if (!"signup".equals(step) && !"activated".equals(step)) {
			return R.fail("不支持的事件：" + step);
		}
		Map<String, Object> props = new LinkedHashMap<>();
		Object rawProps = body == null ? null : body.get("props");
		if (rawProps instanceof Map) {
			for (Map.Entry<String, Object> entry : ((Map<String, Object>) rawProps).entrySet()) {
				props.put(entry.getKey(), entry.getValue());
			}
		}
		props.put("visitorId", visitorId);

		LocalDateTime now = LocalDateTime.now();
		LandingEvent row = new LandingEvent();
		row.setSiteId(DEFAULT_SITE_ID);
		row.setSessionId("journey");
		row.setVisitorId(StrUtil.sub(visitorId, 0, 64));
		row.setEventName(StrUtil.sub(step, 0, 64));
		row.setProps(JSONUtil.toJsonStr(props));
		row.setStatDay(LocalDate.now());
		row.setCreateTime(now);
		row.setUpdateTime(now);
		eventMapper.insert(row);
		return R.success("记录成功");
	}

	// ---------- 辅助 ----------

	private static void appendAlternate(StringBuilder xml, String hreflang, String href) {
		xml.append("<xhtml:link rel=\"alternate\" hreflang=\"").append(hreflang)
			.append("\" href=\"").append(escapeXml(href)).append("\"/>");
	}

	private static ResponseEntity<String> plainText(String body) {
		return ResponseEntity.ok()
			.contentType(new MediaType("text", "plain", StandardCharsets.UTF_8))
			.body(body);
	}

	private static String stringValue(Map<String, Object> body, String key) {
		if (body == null || body.get(key) == null) {
			return null;
		}
		return String.valueOf(body.get(key));
	}

	private static String escapeXml(String value) {
		if (value == null) {
			return "";
		}
		return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
			.replace("\"", "&quot;").replace("'", "&apos;");
	}
}
