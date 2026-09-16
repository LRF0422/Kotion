package com.knowledge.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.boot.ctrl.KnowledgeController;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.system.domain.LandingChangelog;
import com.knowledge.system.domain.LandingContent;
import com.knowledge.system.domain.LandingContentRevision;
import com.knowledge.system.domain.LandingLink;
import com.knowledge.system.domain.LandingSubscriber;
import com.knowledge.system.domain.dto.LandingLinkDTO;
import com.knowledge.system.domain.vo.LandingBreakdownVO;
import com.knowledge.system.domain.vo.LandingChannelVO;
import com.knowledge.system.domain.vo.LandingDailyTrendVO;
import com.knowledge.system.domain.vo.LandingEventRankVO;
import com.knowledge.system.domain.vo.LandingOverviewVO;
import com.knowledge.system.domain.vo.LandingPageRankVO;
import com.knowledge.system.domain.vo.LandingPropCountVO;
import com.knowledge.system.domain.vo.LandingReferrerVO;
import com.knowledge.system.domain.vo.LandingSessionVO;
import com.knowledge.system.service.LandingChangelogService;
import com.knowledge.system.service.LandingContentService;
import com.knowledge.system.service.LandingLinkService;
import com.knowledge.system.service.LandingSettingService;
import com.knowledge.system.service.LandingStatsService;
import com.knowledge.system.service.LandingSubscribeService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.AllArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 落地页运营管理接口（admin 专用）
 */
@RestController
@AllArgsConstructor
@RequestMapping("/admin/ops")
@PreAuthorize("(hasRole('platform.dashboard.read') or " + RoleConstant.HAS_ROLE_ADMIN
	+ ") and principal.clientId == 'kotion-platform-admin'")
@Api(value = "落地页运营管理", tags = "落地页运营管理")
public class AdminLandingOpsController extends KnowledgeController {

	private static final String WRITE_AUTH = "(hasRole('platform.settings.manage') or "
		+ RoleConstant.HAS_ROLE_ADMIN + ") and principal.clientId == 'kotion-platform-admin'";

	private final LandingStatsService landingStatsService;
	private final LandingContentService landingContentService;
	private final LandingSubscribeService landingSubscribeService;
	private final LandingLinkService landingLinkService;
	private final LandingChangelogService landingChangelogService;
	private final LandingSettingService landingSettingService;

	// ---------- 统计 ----------

	@GetMapping("/stats/overview")
	@ApiOperation(value = "总览")
	public R<LandingOverviewVO> overview(@RequestParam(value = "siteId", required = false) String siteId,
		@RequestParam(value = "days", defaultValue = "30") Integer days) {
		return R.data(landingStatsService.overview(site(siteId), orDefault(days, 30)));
	}

	@GetMapping("/stats/timeseries")
	@ApiOperation(value = "按天趋势")
	public R<List<LandingDailyTrendVO>> timeseries(@RequestParam(value = "siteId", required = false) String siteId,
		@RequestParam(value = "days", defaultValue = "30") Integer days) {
		return R.data(landingStatsService.timeseries(site(siteId), orDefault(days, 30)));
	}

	@GetMapping("/stats/pages")
	@ApiOperation(value = "页面排行")
	public R<List<LandingPageRankVO>> pages(@RequestParam(value = "siteId", required = false) String siteId,
		@RequestParam(value = "days", defaultValue = "30") Integer days,
		@RequestParam(value = "limit", defaultValue = "20") Integer limit) {
		return R.data(landingStatsService.topPages(site(siteId), orDefault(days, 30), orDefault(limit, 20)));
	}

	@GetMapping("/stats/events")
	@ApiOperation(value = "事件排行")
	public R<List<LandingEventRankVO>> events(@RequestParam(value = "siteId", required = false) String siteId,
		@RequestParam(value = "days", defaultValue = "30") Integer days,
		@RequestParam(value = "limit", defaultValue = "30") Integer limit) {
		return R.data(landingStatsService.topEvents(site(siteId), orDefault(days, 30), orDefault(limit, 30)));
	}

	@GetMapping("/stats/channels")
	@ApiOperation(value = "渠道归因")
	public R<List<LandingChannelVO>> channels(@RequestParam(value = "siteId", required = false) String siteId,
		@RequestParam(value = "days", defaultValue = "30") Integer days,
		@RequestParam(value = "limit", defaultValue = "20") Integer limit) {
		return R.data(landingStatsService.channels(site(siteId), orDefault(days, 30), orDefault(limit, 20)));
	}

	@GetMapping("/stats/referrers")
	@ApiOperation(value = "来源排行")
	public R<List<LandingReferrerVO>> referrers(@RequestParam(value = "siteId", required = false) String siteId,
		@RequestParam(value = "days", defaultValue = "30") Integer days,
		@RequestParam(value = "limit", defaultValue = "20") Integer limit) {
		return R.data(landingStatsService.referrers(site(siteId), orDefault(days, 30), orDefault(limit, 20)));
	}

	@GetMapping("/stats/tech")
	@ApiOperation(value = "设备/浏览器/系统分布")
	public R<Map<String, List<LandingBreakdownVO>>> tech(
		@RequestParam(value = "siteId", required = false) String siteId,
		@RequestParam(value = "days", defaultValue = "30") Integer days) {
		return R.data(landingStatsService.tech(site(siteId), orDefault(days, 30)));
	}

	@GetMapping("/stats/event-props")
	@ApiOperation(value = "事件属性分布")
	public R<List<LandingPropCountVO>> eventProps(
		@RequestParam(value = "siteId", required = false) String siteId,
		@RequestParam(value = "name", defaultValue = "cta_click") String name,
		@RequestParam(value = "key", defaultValue = "target") String key,
		@RequestParam(value = "days", defaultValue = "30") Integer days,
		@RequestParam(value = "limit", defaultValue = "30") Integer limit) {
		return R.data(landingStatsService.eventProps(site(siteId), name, key, orDefault(days, 30), orDefault(limit, 30)));
	}

	@GetMapping("/stats/realtime")
	@ApiOperation(value = "实时访客")
	public R<Map<String, Object>> realtime(@RequestParam(value = "siteId", required = false) String siteId,
		@RequestParam(value = "minutes", defaultValue = "30") Integer minutes) {
		return R.data(landingStatsService.realtime(site(siteId), orDefault(minutes, 30)));
	}

	@GetMapping("/stats/sessions")
	@ApiOperation(value = "最近会话")
	public R<List<LandingSessionVO>> sessions(@RequestParam(value = "siteId", required = false) String siteId,
		@RequestParam(value = "limit", defaultValue = "50") Integer limit) {
		return R.data(landingStatsService.sessions(site(siteId), orDefault(limit, 50)));
	}

	@SuppressWarnings("unchecked")
	@PostMapping("/stats/funnel")
	@ApiOperation(value = "转化漏斗")
	public R<Map<String, Object>> funnel(@RequestBody Map<String, Object> body) {
		String siteId = site(body.get("siteId") == null ? null : String.valueOf(body.get("siteId")));
		int days = orDefault(body.get("days") == null ? null : Integer.valueOf(String.valueOf(body.get("days"))), 30);
		List<Map<String, String>> steps = (List<Map<String, String>>) body.get("steps");
		return R.data(landingStatsService.funnel(siteId, days, steps));
	}

	// ---------- 文案 CMS ----------

	@GetMapping("/content")
	@ApiOperation(value = "文案列表")
	public R<List<LandingContent>> contentList(@RequestParam(value = "locale", required = false) String locale) {
		return R.data(landingContentService.list(locale));
	}

	@GetMapping("/content/{key}")
	@ApiOperation(value = "文案详情")
	public R<LandingContent> contentDetail(@PathVariable("key") String key,
		@RequestParam(value = "locale", defaultValue = "zh") String locale) {
		return R.data(landingContentService.detail(key, locale));
	}

	@PutMapping("/content/{key}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "保存草稿")
	public R<LandingContent> contentSave(@PathVariable("key") String key, @RequestBody Map<String, Object> body) {
		String locale = String.valueOf(body.getOrDefault("locale", "zh"));
		return R.data(landingContentService.saveDraft(key, locale, body.get("draft"), operator(body.get("by"))));
	}

	@PostMapping("/content/{key}/publish")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "发布文案")
	public R<LandingContent> contentPublish(@PathVariable("key") String key, @RequestBody Map<String, Object> body) {
		String locale = String.valueOf(body.getOrDefault("locale", "zh"));
		return R.data(landingContentService.publish(key, locale,
			body.get("note") == null ? null : String.valueOf(body.get("note")), operator(body.get("by"))));
	}

	@GetMapping("/content/{key}/revisions")
	@ApiOperation(value = "文案历史版本")
	public R<List<LandingContentRevision>> contentRevisions(@PathVariable("key") String key,
		@RequestParam(value = "locale", defaultValue = "zh") String locale) {
		return R.data(landingContentService.revisions(key, locale));
	}

	@PostMapping("/content/{key}/rollback")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "回滚到指定版本")
	public R<LandingContent> contentRollback(@PathVariable("key") String key, @RequestBody Map<String, Object> body) {
		String locale = String.valueOf(body.getOrDefault("locale", "zh"));
		Integer version = body.get("version") == null ? null : Integer.valueOf(String.valueOf(body.get("version")));
		return R.data(landingContentService.rollback(key, locale, version));
	}

	// ---------- 订阅线索 ----------

	@GetMapping("/subscribers")
	@ApiOperation(value = "订阅列表")
	public R<IPage<LandingSubscriber>> subscribers(
		@RequestParam(value = "current", defaultValue = "1") Long current,
		@RequestParam(value = "size", defaultValue = "20") Long size,
		@RequestParam(value = "status", required = false) String status,
		@RequestParam(value = "search", required = false) String search) {
		return R.data(landingSubscribeService.page(current == null ? 1L : current, size == null ? 20L : size,
			status, search));
	}

	@PatchMapping("/subscribers/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "更新订阅状态")
	public R<Void> subscriberUpdate(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
		landingSubscribeService.update(id,
			body.get("status") == null ? null : String.valueOf(body.get("status")),
			body.get("note") == null ? null : String.valueOf(body.get("note")));
		return R.success("更新成功");
	}

	@DeleteMapping("/subscribers/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "删除订阅")
	public R<Void> subscriberDelete(@PathVariable("id") Long id) {
		landingSubscribeService.delete(id);
		return R.success("删除成功");
	}

	@GetMapping("/subscribers/export")
	@ApiOperation(value = "导出订阅 CSV")
	public void subscriberExport(HttpServletResponse response) throws IOException {
		String csv = landingSubscribeService.exportCsv();
		response.setContentType("text/csv; charset=UTF-8");
		response.setHeader("Content-Disposition", "attachment; filename=\"landing-subscribers.csv\"");
		byte[] bytes = csv.getBytes(StandardCharsets.UTF_8);
		response.setContentLength(bytes.length);
		response.getOutputStream().write(bytes);
		response.getOutputStream().flush();
	}

	// ---------- 渠道短链 ----------

	@GetMapping("/links")
	@ApiOperation(value = "短链列表")
	public R<List<LandingLink>> links() {
		return R.data(landingLinkService.list());
	}

	@PostMapping("/links")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "新建短链")
	public R<LandingLink> linkCreate(@RequestBody LandingLinkDTO dto) {
		return R.data(landingLinkService.create(dto));
	}

	@PutMapping("/links/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "更新短链")
	public R<LandingLink> linkUpdate(@PathVariable("id") Long id, @RequestBody LandingLinkDTO dto) {
		return R.data(landingLinkService.update(id, dto));
	}

	@DeleteMapping("/links/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "删除短链")
	public R<Void> linkDelete(@PathVariable("id") Long id) {
		landingLinkService.delete(id);
		return R.success("删除成功");
	}

	@GetMapping("/links/{slug}/stats")
	@ApiOperation(value = "短链点击趋势")
	public R<List<Map<String, Object>>> linkStats(@PathVariable("slug") String slug,
		@RequestParam(value = "days", defaultValue = "30") Integer days) {
		return R.data(landingLinkService.dailyClicks(slug, orDefault(days, 30)));
	}

	// ---------- 更新日志 ----------

	@GetMapping("/changelog")
	@ApiOperation(value = "更新日志列表")
	public R<List<LandingChangelog>> changelogList() {
		return R.data(landingChangelogService.adminList());
	}

	@PostMapping("/changelog/refresh")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "同步 GitHub Releases")
	public R<Map<String, Object>> changelogRefresh() {
		int count = landingChangelogService.refresh();
		Map<String, Object> result = new java.util.HashMap<>(2);
		result.put("count", count);
		return R.data(result);
	}

	@PatchMapping("/changelog/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "置顶/隐藏更新日志")
	public R<Void> changelogUpdate(@PathVariable("id") Long id, @RequestBody Map<String, Object> body) {
		landingChangelogService.update(id,
			body.get("pinned") == null ? null : Boolean.valueOf(String.valueOf(body.get("pinned"))),
			body.get("hidden") == null ? null : Boolean.valueOf(String.valueOf(body.get("hidden"))));
		return R.success("更新成功");
	}

	// ---------- 设置 ----------

	@GetMapping("/settings")
	@ApiOperation(value = "设置列表")
	public R<Map<String, String>> settings() {
		return R.data(landingSettingService.all());
	}

	@PutMapping("/settings")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "保存设置")
	public R<Map<String, Object>> settingsSave(@RequestBody Map<String, Object> body) {
		int count = landingSettingService.put(body);
		Map<String, Object> result = new java.util.HashMap<>(2);
		result.put("count", count);
		return R.data(result);
	}

	private String site(String siteId) {
		return siteId == null || siteId.trim().isEmpty() ? LandingStatsService.DEFAULT_SITE_ID : siteId.trim();
	}

	private int orDefault(Integer value, int fallback) {
		return value == null || value <= 0 ? fallback : value;
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
}
