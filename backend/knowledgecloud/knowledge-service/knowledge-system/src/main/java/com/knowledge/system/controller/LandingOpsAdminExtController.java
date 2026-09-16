package com.knowledge.system.controller;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.knowledge.core.boot.ctrl.KnowledgeController;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.core.tool.utils.WebUtil;
import com.knowledge.system.domain.LandingAlertEvent;
import com.knowledge.system.domain.LandingAlertRule;
import com.knowledge.system.domain.LandingCampaign;
import com.knowledge.system.domain.LandingCampaignSend;
import com.knowledge.system.domain.LandingChangelog;
import com.knowledge.system.domain.LandingEventDict;
import com.knowledge.system.domain.LandingFilterRule;
import com.knowledge.system.domain.LandingGoal;
import com.knowledge.system.domain.LandingLink;
import com.knowledge.system.domain.LandingOpsAudit;
import com.knowledge.system.domain.LandingReferral;
import com.knowledge.system.domain.LandingSubscriber;
import com.knowledge.system.domain.LandingSubscriberTagRel;
import com.knowledge.system.domain.dto.LandingLinkDTO;
import com.knowledge.system.mapper.LandingChangelogMapper;
import com.knowledge.system.mapper.LandingLinkMapper;
import com.knowledge.system.mapper.LandingOpsMapper;
import com.knowledge.system.mapper.LandingSubscriberMapper;
import com.knowledge.system.mapper.LandingSubscriberTagRelMapper;
import com.knowledge.system.service.LandingAlertService;
import com.knowledge.system.service.LandingCampaignService;
import com.knowledge.system.service.LandingEventDictService;
import com.knowledge.system.service.LandingExperimentService;
import com.knowledge.system.service.LandingFilterRuleService;
import com.knowledge.system.service.LandingFunnelService;
import com.knowledge.system.service.LandingGoalService;
import com.knowledge.system.service.LandingLinkService;
import com.knowledge.system.service.LandingOpsAuditService;
import com.knowledge.system.service.LandingOpsReportService;
import com.knowledge.system.service.LandingReferralService;
import com.knowledge.system.service.LandingResourceService;
import com.knowledge.system.service.LandingSubscribeService;
import com.knowledge.system.service.LandingSubscriberTagService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 落地页运营增强接口（P0~P2，admin 专用）。
 *
 * <p>与 {@link AdminLandingOpsController} 共用 {@code /admin/ops} 前缀，
 * 按路径分段互补，不重复定义已有端点。所有写操作都会写入
 * {@link LandingOpsAuditService}，保证「谁在什么时候改了什么」可追溯。</p>
 */
@Slf4j
@RestController
@AllArgsConstructor
@RequestMapping("/admin/ops")
@PreAuthorize("(hasRole('platform.landing.read') or hasRole('platform.dashboard.read') or "
	+ RoleConstant.HAS_ROLE_ADMIN + ") and principal.clientId == 'kotion-platform-admin'")
@Api(value = "落地页运营增强", tags = "落地页运营增强")
public class LandingOpsAdminExtController extends KnowledgeController {

	private static final String WRITE_AUTH = "(hasRole('platform.landing.manage') or "
		+ "hasRole('platform.settings.manage') or " + RoleConstant.HAS_ROLE_ADMIN
		+ ") and principal.clientId == 'kotion-platform-admin'";

	private static final String DEFAULT_SITE_ID = "kotion-landing";
	private static final int IMPORT_LIMIT = 5000;
	private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$");
	private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

	private final LandingOpsAuditService opsAuditService;
	private final LandingOpsReportService opsReportService;
	private final LandingFilterRuleService filterRuleService;
	private final LandingEventDictService eventDictService;
	private final LandingGoalService goalService;
	private final LandingFunnelService funnelService;
	private final LandingResourceService resourceService;
	private final LandingExperimentService experimentService;
	private final LandingSubscriberTagService subscriberTagService;
	private final LandingSubscribeService subscribeService;
	private final LandingLinkService linkService;
	private final LandingCampaignService campaignService;
	private final LandingAlertService alertService;
	private final LandingReferralService referralService;
	private final LandingSubscriberMapper subscriberMapper;
	private final LandingSubscriberTagRelMapper subscriberTagRelMapper;
	private final LandingLinkMapper linkMapper;
	private final LandingChangelogMapper changelogMapper;
	private final LandingOpsMapper opsMapper;

	// ---------- 审计 / 数据口径 ----------

	@GetMapping("/audit")
	@ApiOperation(value = "变更审计分页")
	public R<IPage<LandingOpsAudit>> audit(
		@RequestParam(value = "current", defaultValue = "1") Long current,
		@RequestParam(value = "size", defaultValue = "20") Long size,
		@RequestParam(value = "action", required = false) String action,
		@RequestParam(value = "targetType", required = false) String targetType,
		@RequestParam(value = "operator", required = false) String operator,
		@RequestParam(value = "startTime", required = false) String startTime,
		@RequestParam(value = "endTime", required = false) String endTime) {
		return R.data(opsAuditService.page(pageNo(current), pageSize(size), action, targetType, operator,
			startTime, endTime));
	}

	@GetMapping("/data-quality")
	@ApiOperation(value = "数据口径与流量过滤")
	public R<Map<String, Object>> dataQuality() {
		return R.data(opsReportService.dataQuality());
	}

	@PutMapping("/data-quality")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "保存数据口径与流量过滤")
	public R<Map<String, Object>> dataQualitySave(@RequestBody Map<String, Object> body) {
		Map<String, Object> result = opsReportService.saveDataQuality(body);
		recordAudit("UPDATE", "SETTING", "public.ops", "更新数据口径与流量过滤设置", body);
		return R.data(result);
	}

	// ---------- 流量过滤规则 ----------

	@GetMapping("/filters")
	@ApiOperation(value = "过滤规则列表")
	public R<List<LandingFilterRule>> filters() {
		return R.data(filterRuleService.list());
	}

	@PostMapping("/filters")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "新建过滤规则")
	public R<LandingFilterRule> filterCreate(@RequestBody LandingFilterRule payload) {
		LandingFilterRule row = filterRuleService.create(payload);
		recordAudit("CREATE", "FILTER", String.valueOf(row.getId()),
			"新建流量过滤规则：" + StrUtil.blankToDefault(row.getPattern(), "-"), payload);
		return R.data(row);
	}

	@PutMapping("/filters/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "更新过滤规则")
	public R<LandingFilterRule> filterUpdate(@PathVariable("id") Long id,
		@RequestBody LandingFilterRule payload) {
		LandingFilterRule row = filterRuleService.update(id, payload);
		recordAudit("UPDATE", "FILTER", String.valueOf(id),
			"更新流量过滤规则：" + StrUtil.blankToDefault(row.getPattern(), "-"), payload);
		return R.data(row);
	}

	@DeleteMapping("/filters/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "删除过滤规则")
	public R<Void> filterDelete(@PathVariable("id") Long id) {
		filterRuleService.delete(id);
		recordAudit("DELETE", "FILTER", String.valueOf(id), "删除流量过滤规则", null);
		return R.success("删除成功");
	}

	// ---------- 事件字典 ----------

	@GetMapping("/event-dict")
	@ApiOperation(value = "事件字典列表")
	public R<List<LandingEventDict>> eventDict() {
		return R.data(eventDictService.list());
	}

	@PostMapping("/event-dict")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "登记事件")
	public R<LandingEventDict> eventDictCreate(@RequestBody LandingEventDict payload) {
		LandingEventDict row = eventDictService.create(payload);
		recordAudit("CREATE", "EVENT_DICT", row.getEventName(), "登记埋点事件：" + row.getEventName(), payload);
		return R.data(row);
	}

	@PutMapping("/event-dict/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "更新事件")
	public R<LandingEventDict> eventDictUpdate(@PathVariable("id") Long id,
		@RequestBody LandingEventDict payload) {
		LandingEventDict row = eventDictService.update(id, payload);
		recordAudit("UPDATE", "EVENT_DICT", row.getEventName(), "更新埋点事件：" + row.getEventName(), payload);
		return R.data(row);
	}

	@DeleteMapping("/event-dict/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "删除事件")
	public R<Void> eventDictDelete(@PathVariable("id") Long id) {
		eventDictService.delete(id);
		recordAudit("DELETE", "EVENT_DICT", String.valueOf(id), "删除埋点事件", null);
		return R.success("删除成功");
	}

	@GetMapping("/event-dict/coverage")
	@ApiOperation(value = "事件覆盖率对比")
	public R<Map<String, Object>> eventDictCoverage(
		@RequestParam(value = "days", defaultValue = "30") Integer days) {
		return R.data(eventDictService.coverage(days == null ? 30 : days));
	}

	@SuppressWarnings("unchecked")
	@PostMapping("/event-dict/sync")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "批量同步事件字典")
	public R<Map<String, Object>> eventDictSync(@RequestBody Map<String, Object> body) {
		Object raw = body == null ? null : body.get("events");
		List<Map<String, String>> events = new ArrayList<>();
		if (raw instanceof List) {
			for (Object item : (List<Object>) raw) {
				if (!(item instanceof Map)) {
					continue;
				}
				Map<String, Object> entry = (Map<String, Object>) item;
				Map<String, String> normalized = new LinkedHashMap<>(3);
				normalized.put("eventName", entry.get("eventName") == null ? null
					: String.valueOf(entry.get("eventName")));
				normalized.put("category", entry.get("category") == null ? null
					: String.valueOf(entry.get("category")));
				normalized.put("description", entry.get("description") == null ? null
					: String.valueOf(entry.get("description")));
				events.add(normalized);
			}
		}
		Map<String, Object> result = eventDictService.sync(events);
		recordAudit("SYNC", "EVENT_DICT", "sync", "同步事件字典：新增 " + result.get("created") + " 条", null);
		return R.data(result);
	}

	// ---------- 转化目标 ----------

	@GetMapping("/goals")
	@ApiOperation(value = "目标列表")
	public R<List<LandingGoal>> goals() {
		return R.data(goalService.list());
	}

	@PostMapping("/goals")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "新建目标")
	public R<LandingGoal> goalCreate(@RequestBody LandingGoal payload) {
		LandingGoal row = goalService.create(payload);
		recordAudit("CREATE", "GOAL", row.getGoalKey(), "新建转化目标：" + row.getName(), payload);
		return R.data(row);
	}

	@PutMapping("/goals/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "更新目标")
	public R<LandingGoal> goalUpdate(@PathVariable("id") Long id, @RequestBody LandingGoal payload) {
		LandingGoal row = goalService.update(id, payload);
		recordAudit("UPDATE", "GOAL", row.getGoalKey(), "更新转化目标：" + row.getName(), payload);
		return R.data(row);
	}

	@DeleteMapping("/goals/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "删除目标")
	public R<Void> goalDelete(@PathVariable("id") Long id) {
		goalService.delete(id);
		recordAudit("DELETE", "GOAL", String.valueOf(id), "删除转化目标", null);
		return R.success("删除成功");
	}

	@GetMapping("/goals/stats")
	@ApiOperation(value = "目标效果")
	public R<List<Map<String, Object>>> goalStats(
		@RequestParam(value = "days", defaultValue = "30") Integer days) {
		return R.data(goalService.stats(days == null ? 30 : days));
	}

	// ---------- 漏斗 ----------

	@GetMapping("/funnels")
	@ApiOperation(value = "漏斗列表")
	public R<List<Map<String, Object>>> funnels() {
		return R.data(funnelService.list());
	}

	@PostMapping("/funnels")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "新建漏斗")
	public R<Map<String, Object>> funnelCreate(@RequestBody Map<String, Object> body) {
		Map<String, Object> row = funnelService.create(body);
		recordAudit("CREATE", "FUNNEL", String.valueOf(row.get("funnelKey")),
			"新建漏斗：" + row.get("name"), body);
		return R.data(row);
	}

	@PutMapping("/funnels/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "更新漏斗")
	public R<Map<String, Object>> funnelUpdate(@PathVariable("id") Long id,
		@RequestBody Map<String, Object> body) {
		Map<String, Object> row = funnelService.update(id, body);
		recordAudit("UPDATE", "FUNNEL", String.valueOf(row.get("funnelKey")),
			"更新漏斗：" + row.get("name"), body);
		return R.data(row);
	}

	@DeleteMapping("/funnels/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "删除漏斗")
	public R<Void> funnelDelete(@PathVariable("id") Long id) {
		funnelService.delete(id);
		recordAudit("DELETE", "FUNNEL", String.valueOf(id), "删除漏斗", null);
		return R.success("删除成功");
	}

	@GetMapping("/funnels/{funnelKey}/stats")
	@ApiOperation(value = "漏斗效果")
	public R<Map<String, Object>> funnelStats(@PathVariable("funnelKey") String funnelKey,
		@RequestParam(value = "days", defaultValue = "30") Integer days) {
		return R.data(funnelService.stats(funnelKey, days == null ? 30 : days));
	}

	// ---------- 通用配置资源 ----------

	@GetMapping("/resources")
	@ApiOperation(value = "配置资源列表")
	public R<List<Map<String, Object>>> resources(@RequestParam(value = "kind", required = false) String kind,
		@RequestParam(value = "locale", required = false) String locale,
		@RequestParam(value = "status", required = false) String status) {
		return R.data(resourceService.list(kind, locale, status));
	}

	@GetMapping("/resources/{kind}/{key}")
	@ApiOperation(value = "配置资源详情")
	public R<Map<String, Object>> resourceDetail(@PathVariable("kind") String kind,
		@PathVariable("key") String key,
		@RequestParam(value = "locale", defaultValue = "zh") String locale) {
		return R.data(resourceService.detail(kind, key, locale));
	}

	@PutMapping("/resources/{kind}/{key}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "保存配置资源")
	public R<Map<String, Object>> resourceSave(@PathVariable("kind") String kind,
		@PathVariable("key") String key, @RequestBody Map<String, Object> body) {
		Map<String, Object> row = resourceService.save(kind, key, body);
		recordAudit("SAVE", "RESOURCE", kind + "/" + key, "保存配置资源：" + kind + "/" + key, body);
		return R.data(row);
	}

	@DeleteMapping("/resources/{kind}/{key}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "删除配置资源")
	public R<Void> resourceDelete(@PathVariable("kind") String kind, @PathVariable("key") String key,
		@RequestParam(value = "locale", defaultValue = "zh") String locale) {
		resourceService.delete(kind, key, locale);
		recordAudit("DELETE", "RESOURCE", kind + "/" + key, "删除配置资源：" + kind + "/" + key, null);
		return R.success("删除成功");
	}

	@SuppressWarnings("unchecked")
	@PostMapping("/resources/{kind}/batch")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "批量保存配置资源")
	public R<Map<String, Object>> resourceBatch(@PathVariable("kind") String kind,
		@RequestBody Map<String, Object> body) {
		Object raw = body == null ? null : body.get("items");
		List<Map<String, Object>> items = new ArrayList<>();
		if (raw instanceof List) {
			for (Object item : (List<Object>) raw) {
				if (item instanceof Map) {
					items.add((Map<String, Object>) item);
				}
			}
		}
		int count = resourceService.batchSave(kind, items);
		recordAudit("BATCH_SAVE", "RESOURCE", kind, "批量保存配置资源：" + kind + " × " + count, null);
		Map<String, Object> result = new LinkedHashMap<>(1);
		result.put("count", count);
		return R.data(result);
	}

	// ---------- 实验 ----------

	@GetMapping("/experiments")
	@ApiOperation(value = "实验列表")
	public R<List<Map<String, Object>>> experiments() {
		return R.data(experimentService.list());
	}

	@PostMapping("/experiments")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "新建实验")
	public R<Map<String, Object>> experimentCreate(@RequestBody Map<String, Object> body) {
		Map<String, Object> row = experimentService.create(body);
		recordAudit("CREATE", "EXPERIMENT", String.valueOf(row.get("expKey")),
			"新建实验：" + row.get("name"), body);
		return R.data(row);
	}

	@PutMapping("/experiments/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "更新实验")
	public R<Map<String, Object>> experimentUpdate(@PathVariable("id") Long id,
		@RequestBody Map<String, Object> body) {
		Map<String, Object> row = experimentService.update(id, body);
		recordAudit("UPDATE", "EXPERIMENT", String.valueOf(row.get("expKey")),
			"更新实验：" + row.get("name"), body);
		return R.data(row);
	}

	@DeleteMapping("/experiments/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "删除实验")
	public R<Void> experimentDelete(@PathVariable("id") Long id) {
		experimentService.delete(id);
		recordAudit("DELETE", "EXPERIMENT", String.valueOf(id), "删除实验", null);
		return R.success("删除成功");
	}

	@PutMapping("/experiments/{id}/variants")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "保存实验分组")
	public R<Map<String, Object>> experimentVariants(@PathVariable("id") Long id,
		@RequestBody Map<String, Object> body) {
		Map<String, Object> row = experimentService.saveVariants(id, body);
		recordAudit("SAVE_VARIANTS", "EXPERIMENT", String.valueOf(row.get("expKey")),
			"保存实验分组：" + row.get("name"), body);
		return R.data(row);
	}

	@GetMapping("/experiments/{expKey}/results")
	@ApiOperation(value = "实验结果")
	public R<Map<String, Object>> experimentResults(@PathVariable("expKey") String expKey,
		@RequestParam(value = "days", defaultValue = "30") Integer days) {
		return R.data(experimentService.results(expKey, days == null ? 30 : days));
	}

	// ---------- 标签 / 订阅者 ----------

	@GetMapping("/tags")
	@ApiOperation(value = "标签列表")
	public R<List<Map<String, Object>>> tags() {
		return R.data(subscriberTagService.list());
	}

	@PostMapping("/tags")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "新建标签")
	public R<Map<String, Object>> tagCreate(@RequestBody Map<String, Object> body) {
		Map<String, Object> row = subscriberTagService.create(body);
		recordAudit("CREATE", "TAG", String.valueOf(row.get("tag")), "新建订阅标签：" + row.get("tag"), body);
		return R.data(row);
	}

	@PutMapping("/tags/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "更新标签")
	public R<Map<String, Object>> tagUpdate(@PathVariable("id") Long id,
		@RequestBody Map<String, Object> body) {
		Map<String, Object> row = subscriberTagService.update(id, body);
		recordAudit("UPDATE", "TAG", String.valueOf(row.get("tag")), "更新订阅标签：" + row.get("tag"), body);
		return R.data(row);
	}

	@DeleteMapping("/tags/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "删除标签")
	public R<Void> tagDelete(@PathVariable("id") Long id) {
		subscriberTagService.delete(id);
		recordAudit("DELETE", "TAG", String.valueOf(id), "删除订阅标签", null);
		return R.success("删除成功");
	}

	@SuppressWarnings("unchecked")
	@PutMapping("/subscribers/{id}/tags")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "设置订阅者标签")
	public R<Map<String, Object>> subscriberTags(@PathVariable("id") Long id,
		@RequestBody Map<String, Object> body) {
		Object raw = body == null ? null : body.get("tagIds");
		List<Long> tagIds = new ArrayList<>();
		if (raw instanceof List) {
			for (Object item : (List<Object>) raw) {
				Long tagId = toLong(item);
				if (tagId != null) {
					tagIds.add(tagId);
				}
			}
		}
		subscriberTagService.setSubscriberTags(id, tagIds);
		Map<String, Object> result = new LinkedHashMap<>(1);
		result.put("count", tagIds.size());
		recordAudit("SET_TAGS", "SUBSCRIBER", String.valueOf(id), "设置订阅者标签 " + tagIds.size() + " 个", tagIds);
		return R.data(result);
	}

	/**
	 * 订阅者筛选分页。
	 *
	 * <p>现有 {@code GET /subscribers} 不支持 tagId / utmSource / days，这里补一个
	 * 独立端点；前端契约方可以逐步从 {@code /subscribers} 切过来。</p>
	 */
	@GetMapping("/subscribers/filtered")
	@ApiOperation(value = "订阅者筛选分页")
	public R<IPage<LandingSubscriber>> subscribersFiltered(
		@RequestParam(value = "current", defaultValue = "1") Long current,
		@RequestParam(value = "size", defaultValue = "20") Long size,
		@RequestParam(value = "status", required = false) String status,
		@RequestParam(value = "search", required = false) String search,
		@RequestParam(value = "tagId", required = false) Long tagId,
		@RequestParam(value = "utmSource", required = false) String utmSource,
		@RequestParam(value = "days", required = false) Integer days) {
		long page = pageNo(current);
		long pageSize = pageSize(size);
		LocalDateTime since = days != null && days > 0 ? LocalDateTime.now().minusDays(days) : null;
		LambdaQueryWrapper<LandingSubscriber> wrapper = Wrappers.<LandingSubscriber>lambdaQuery()
			.eq(StrUtil.isNotBlank(status), LandingSubscriber::getStatus, status)
			.eq(StrUtil.isNotBlank(utmSource), LandingSubscriber::getUtmSource, utmSource)
			.ge(since != null, LandingSubscriber::getCreateTime, since)
			.and(StrUtil.isNotBlank(search), w -> w
				.like(LandingSubscriber::getEmail, search)
				.or()
				.like(LandingSubscriber::getNote, search))
			.orderByDesc(LandingSubscriber::getCreateTime);
		if (tagId != null) {
			List<LandingSubscriberTagRel> rels = subscriberTagRelMapper.selectList(
				Wrappers.<LandingSubscriberTagRel>lambdaQuery()
					.eq(LandingSubscriberTagRel::getTagId, tagId));
			List<Long> subscriberIds = new ArrayList<>();
			for (LandingSubscriberTagRel rel : rels) {
				if (rel.getSubscriberId() != null) {
					subscriberIds.add(rel.getSubscriberId());
				}
			}
			if (subscriberIds.isEmpty()) {
				return R.data(new Page<LandingSubscriber>(page, pageSize));
			}
			wrapper.in(LandingSubscriber::getId, subscriberIds);
		}
		return R.data(subscriberMapper.selectPage(new Page<LandingSubscriber>(page, pageSize), wrapper));
	}

	@PostMapping("/subscribers/import")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "CSV 导入订阅线索")
	public R<Map<String, Object>> subscriberImport(@RequestBody Map<String, Object> body) {
		String csv = body == null ? null : stringValue(body.get("csv"));
		String source = body == null ? null : stringValue(body.get("source"));
		String status = body == null ? null : stringValue(body.get("status"));
		String defaultStatus = StrUtil.blankToDefault(StrUtil.trimToEmpty(status), "subscribed");

		List<List<String>> rows = parseCsv(csv);
		int imported = 0;
		int duplicated = 0;
		int invalid = 0;
		if (!rows.isEmpty()) {
			List<String> headers = rows.get(0);
			int emailIdx = indexOf(headers, "email");
			int statusIdx = indexOf(headers, "status");
			int sourcePathIdx = indexOf(headers, "source_path");
			int noteIdx = indexOf(headers, "note");
			LocalDateTime now = LocalDateTime.now();
			Set<String> seen = new HashSet<>();
			for (int i = 1; i < rows.size() && imported < IMPORT_LIMIT; i++) {
				List<String> cells = rows.get(i);
				String email = StrUtil.trimToEmpty(cell(cells, emailIdx)).toLowerCase();
				if (email.isEmpty()) {
					continue;
				}
				if (!EMAIL.matcher(email).matches()) {
					invalid++;
					continue;
				}
				if (!seen.add(email)) {
					duplicated++;
					continue;
				}
				if (subscriberMapper.selectCount(Wrappers.<LandingSubscriber>lambdaQuery()
					.eq(LandingSubscriber::getEmail, email)) > 0) {
					duplicated++;
					continue;
				}
				LandingSubscriber row = new LandingSubscriber();
				row.setEmail(email);
				row.setStatus(StrUtil.blankToDefault(StrUtil.trimToEmpty(cell(cells, statusIdx)), defaultStatus));
				row.setSourcePath(StrUtil.sub(StrUtil.blankToDefault(StrUtil.trimToEmpty(source),
					StrUtil.trimToEmpty(cell(cells, sourcePathIdx))), 0, 255));
				row.setNote(StrUtil.sub(cell(cells, noteIdx), 0, 255));
				row.setCreateTime(now);
				row.setUpdateTime(now);
				subscriberMapper.insert(row);
				imported++;
			}
		}
		Map<String, Object> result = new LinkedHashMap<>(3);
		result.put("imported", imported);
		result.put("duplicated", duplicated);
		result.put("invalid", invalid);
		recordAudit("IMPORT", "SUBSCRIBER", StrUtil.blankToDefault(source, "csv"),
			"导入订阅线索：新增 " + imported + "，重复 " + duplicated + "，无效 " + invalid, null);
		return R.data(result);
	}

	@SuppressWarnings("unchecked")
	@PostMapping("/subscribers/batch")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "批量更新订阅状态")
	public R<Map<String, Object>> subscriberBatch(@RequestBody Map<String, Object> body) {
		Object rawIds = body == null ? null : body.get("ids");
		String status = body == null || body.get("status") == null ? null : String.valueOf(body.get("status"));
		String note = body == null || body.get("note") == null ? null : String.valueOf(body.get("note"));
		int updated = 0;
		if (rawIds instanceof List) {
			for (Object item : (List<Object>) rawIds) {
				Long id = toLong(item);
				if (id == null) {
					continue;
				}
				try {
					subscribeService.update(id, status, note);
					updated++;
				} catch (Exception e) {
					log.warn("批量更新订阅失败: id={}", id, e);
				}
			}
		}
		Map<String, Object> result = new LinkedHashMap<>(1);
		result.put("updated", updated);
		recordAudit("BATCH_UPDATE", "SUBSCRIBER", null, "批量更新订阅状态：成功 " + updated + " 条", null);
		return R.data(result);
	}

	// ---------- 短链 ----------

	@GetMapping("/links/conversions")
	@ApiOperation(value = "短链点击与转化对比")
	public R<List<Map<String, Object>>> linkConversions(
		@RequestParam(value = "days", defaultValue = "30") Integer days) {
		int window = days == null || days <= 0 ? 30 : days;
		String startDay = LocalDate.now().minusDays(window - 1L).format(DAY);
		List<Map<String, Object>> rows = opsMapper.selectLinkConversions(startDay);
		for (Map<String, Object> row : rows) {
			long visitors = toLongValue(row.get("visitors"));
			long conversions = toLongValue(row.get("conversions"));
			row.put("conversionRate", visitors <= 0 ? 0d
				: BigDecimal.valueOf(conversions * 100d / visitors).setScale(2, RoundingMode.HALF_UP).doubleValue());
		}
		return R.data(rows);
	}

	@PostMapping("/links/import")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "CSV 导入短链")
	public R<Map<String, Object>> linkImport(@RequestBody Map<String, Object> body) {
		String csv = body == null ? null : stringValue(body.get("csv"));
		List<List<String>> rows = parseCsv(csv);
		int imported = 0;
		int skipped = 0;
		if (!rows.isEmpty()) {
			List<String> headers = rows.get(0);
			int slugIdx = indexOf(headers, "slug");
			int targetIdx = indexOf(headers, "target");
			int labelIdx = indexOf(headers, "label");
			int channelIdx = indexOf(headers, "channel");
			int sourceIdx = indexOf(headers, "utm_source");
			int mediumIdx = indexOf(headers, "utm_medium");
			int campaignIdx = indexOf(headers, "utm_campaign");
			for (int i = 1; i < rows.size() && imported < IMPORT_LIMIT; i++) {
				List<String> cells = rows.get(i);
				String slug = StrUtil.trimToEmpty(cell(cells, slugIdx));
				String target = StrUtil.trimToEmpty(cell(cells, targetIdx));
				if (slug.isEmpty() || target.isEmpty()) {
					skipped++;
					continue;
				}
				if (linkMapper.selectCount(Wrappers.<LandingLink>lambdaQuery()
					.eq(LandingLink::getSlug, slug)) > 0) {
					skipped++;
					continue;
				}
				LandingLinkDTO dto = new LandingLinkDTO();
				dto.setSlug(slug);
				dto.setTarget(target);
				dto.setLabel(blankToNull(cell(cells, labelIdx)));
				dto.setChannel(blankToNull(cell(cells, channelIdx)));
				Map<String, String> utm = new LinkedHashMap<>(3);
				utm.put("source", blankToNull(cell(cells, sourceIdx)));
				utm.put("medium", blankToNull(cell(cells, mediumIdx)));
				utm.put("campaign", blankToNull(cell(cells, campaignIdx)));
				dto.setUtm(utm);
				try {
					linkService.create(dto);
					imported++;
				} catch (Exception e) {
					log.warn("导入短链失败: slug={}", slug, e);
					skipped++;
				}
			}
		}
		Map<String, Object> result = new LinkedHashMap<>(2);
		result.put("imported", imported);
		result.put("skipped", skipped);
		recordAudit("IMPORT", "LINK", "csv", "导入短链：新增 " + imported + "，跳过 " + skipped, null);
		return R.data(result);
	}

	// ---------- 邮件活动 ----------

	@GetMapping("/campaigns")
	@ApiOperation(value = "活动列表")
	public R<IPage<LandingCampaign>> campaigns(
		@RequestParam(value = "current", defaultValue = "1") Long current,
		@RequestParam(value = "size", defaultValue = "20") Long size,
		@RequestParam(value = "status", required = false) String status) {
		return R.data(campaignService.page(pageNo(current), pageSize(size), status));
	}

	@GetMapping("/campaigns/{id}")
	@ApiOperation(value = "活动详情")
	public R<LandingCampaign> campaignDetail(@PathVariable("id") Long id) {
		return R.data(campaignService.detail(id));
	}

	@PostMapping("/campaigns")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "新建活动")
	public R<Map<String, Object>> campaignCreate(@RequestBody Map<String, Object> body) {
		Map<String, Object> row = campaignService.create(body);
		recordAudit("CREATE", "CAMPAIGN", String.valueOf(row.get("id")), "新建邮件活动：" + row.get("name"), body);
		return R.data(row);
	}

	@PutMapping("/campaigns/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "更新活动")
	public R<Map<String, Object>> campaignUpdate(@PathVariable("id") Long id,
		@RequestBody Map<String, Object> body) {
		Map<String, Object> row = campaignService.update(id, body);
		recordAudit("UPDATE", "CAMPAIGN", String.valueOf(id), "更新邮件活动：" + row.get("name"), body);
		return R.data(row);
	}

	@DeleteMapping("/campaigns/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "删除活动")
	public R<Void> campaignDelete(@PathVariable("id") Long id) {
		campaignService.delete(id);
		recordAudit("DELETE", "CAMPAIGN", String.valueOf(id), "删除邮件活动", null);
		return R.success("删除成功");
	}

	@PostMapping("/campaigns/audience-preview")
	@ApiOperation(value = "人群预估")
	public R<Map<String, Object>> campaignAudiencePreview(@RequestBody Map<String, Object> body) {
		return R.data(campaignService.audiencePreview(body));
	}

	@PostMapping("/campaigns/{id}/test")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "发送测试邮件")
	public R<Map<String, Object>> campaignTest(@PathVariable("id") Long id,
		@RequestBody Map<String, Object> body) {
		String email = body == null ? null : String.valueOf(body.get("email"));
		Map<String, Object> result = campaignService.test(id, email);
		recordAudit("TEST", "CAMPAIGN", String.valueOf(id), "发送活动测试邮件至 " + email, null);
		return R.data(result);
	}

	@PostMapping("/campaigns/{id}/send")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "立即发送活动")
	public R<Map<String, Object>> campaignSend(@PathVariable("id") Long id) {
		Map<String, Object> result = campaignService.send(id);
		recordAudit("SEND", "CAMPAIGN", String.valueOf(id), "发送邮件活动，队列 " + result.get("queued") + " 人", null);
		return R.data(result);
	}

	@GetMapping("/campaigns/{id}/sends")
	@ApiOperation(value = "活动投递记录")
	public R<IPage<LandingCampaignSend>> campaignSends(
		@PathVariable("id") Long id,
		@RequestParam(value = "current", defaultValue = "1") Long current,
		@RequestParam(value = "size", defaultValue = "20") Long size,
		@RequestParam(value = "status", required = false) String status) {
		return R.data(campaignService.sends(id, pageNo(current), pageSize(size), status));
	}

	// ---------- 告警 ----------

	@GetMapping("/alerts")
	@ApiOperation(value = "告警规则列表")
	public R<List<LandingAlertRule>> alerts() {
		return R.data(alertService.list());
	}

	@PostMapping("/alerts")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "新建告警规则")
	public R<Map<String, Object>> alertCreate(@RequestBody Map<String, Object> body) {
		Map<String, Object> row = alertService.create(body);
		recordAudit("CREATE", "ALERT", String.valueOf(row.get("name")), "新建告警规则：" + row.get("name"), body);
		return R.data(row);
	}

	@PutMapping("/alerts/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "更新告警规则")
	public R<Map<String, Object>> alertUpdate(@PathVariable("id") Long id,
		@RequestBody Map<String, Object> body) {
		Map<String, Object> row = alertService.update(id, body);
		recordAudit("UPDATE", "ALERT", String.valueOf(id), "更新告警规则：" + row.get("name"), body);
		return R.data(row);
	}

	@DeleteMapping("/alerts/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "删除告警规则")
	public R<Void> alertDelete(@PathVariable("id") Long id) {
		alertService.delete(id);
		recordAudit("DELETE", "ALERT", String.valueOf(id), "删除告警规则", null);
		return R.success("删除成功");
	}

	@GetMapping("/alerts/events")
	@ApiOperation(value = "告警记录")
	public R<IPage<LandingAlertEvent>> alertEvents(
		@RequestParam(value = "current", defaultValue = "1") Long current,
		@RequestParam(value = "size", defaultValue = "20") Long size) {
		return R.data(alertService.events(pageNo(current), pageSize(size)));
	}

	@PostMapping("/alerts/check")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "立即巡检告警")
	public R<Map<String, Object>> alertCheck() {
		Map<String, Object> result = alertService.check();
		recordAudit("CHECK", "ALERT", null,
			"巡检告警规则：评估 " + result.get("evaluated") + "，触发 " + result.get("triggered"), null);
		return R.data(result);
	}

	// ---------- 推荐码 ----------

	@GetMapping("/referrals")
	@ApiOperation(value = "邀请码列表")
	public R<List<LandingReferral>> referrals() {
		return R.data(referralService.list());
	}

	@PostMapping("/referrals")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "新建邀请码")
	public R<Map<String, Object>> referralCreate(@RequestBody Map<String, Object> body) {
		Map<String, Object> row = referralService.create(body);
		recordAudit("CREATE", "REFERRAL", String.valueOf(row.get("code")),
			"新建邀请码：" + row.get("code"), body);
		return R.data(row);
	}

	@PutMapping("/referrals/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "更新邀请码")
	public R<Map<String, Object>> referralUpdate(@PathVariable("id") Long id,
		@RequestBody Map<String, Object> body) {
		Map<String, Object> row = referralService.update(id, body);
		recordAudit("UPDATE", "REFERRAL", String.valueOf(row.get("code")),
			"更新邀请码：" + row.get("code"), body);
		return R.data(row);
	}

	@DeleteMapping("/referrals/{id}")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "删除邀请码")
	public R<Void> referralDelete(@PathVariable("id") Long id) {
		referralService.delete(id);
		recordAudit("DELETE", "REFERRAL", String.valueOf(id), "删除邀请码", null);
		return R.success("删除成功");
	}

	// ---------- 工作台 / 导出 / 更新日志联动 ----------

	@GetMapping("/workbench")
	@ApiOperation(value = "运营工作台")
	public R<Map<String, Object>> workbench(@RequestParam(value = "days", defaultValue = "7") Integer days) {
		return R.data(opsReportService.workbench(days == null ? 7 : days));
	}

	/**
	 * 导出运营数据。
	 *
	 * <p>{@code format=csv}（默认）直接以附件写出；{@code format=json} 返回
	 * {@code { dataset, rows }}，rows 为解析后的二维单元格数组。</p>
	 */
	@GetMapping("/export")
	@ApiOperation(value = "导出运营数据")
	public Object export(@RequestParam(value = "dataset", defaultValue = "events") String dataset,
		@RequestParam(value = "days", defaultValue = "30") Integer days,
		@RequestParam(value = "format", defaultValue = "csv") String format,
		HttpServletResponse response) throws IOException {
		String csv = opsReportService.exportCsv(dataset, days == null ? 30 : days);
		if ("json".equalsIgnoreCase(StrUtil.trimToEmpty(format))) {
			Map<String, Object> result = new LinkedHashMap<>(2);
			result.put("dataset", dataset);
			result.put("rows", parseCsv(csv));
			return R.data(result);
		}
		byte[] bytes = csv.getBytes(StandardCharsets.UTF_8);
		response.setContentType("text/csv; charset=UTF-8");
		response.setHeader("Content-Disposition", "attachment; filename=\"landing-" + dataset + ".csv\"");
		response.setContentLength(bytes.length);
		response.getOutputStream().write(bytes);
		response.getOutputStream().flush();
		return null;
	}

	@PostMapping("/changelog/{id}/notify")
	@PreAuthorize(WRITE_AUTH)
	@ApiOperation(value = "从更新日志生成邮件草稿")
	public R<Map<String, Object>> changelogNotify(@PathVariable("id") Long id) {
		LandingChangelog release = changelogMapper.selectById(id);
		if (release == null) {
			throw new ServiceException("更新日志不存在");
		}
		String tag = StrUtil.blankToDefault(StrUtil.trimToEmpty(release.getTag()),
			StrUtil.blankToDefault(StrUtil.trimToEmpty(release.getName()), "新版本"));
		String name = StrUtil.blankToDefault(StrUtil.trimToEmpty(release.getName()), "Kotion " + tag + " 已发布");
		String body = StrUtil.blankToDefault(release.getBody(), "");
		String link = StrUtil.blankToDefault(release.getUrl(), "https://kotion.top/changelog");

		Map<String, Object> payload = new LinkedHashMap<>();
		payload.put("name", name);
		payload.put("subject", "Kotion " + tag + " 已发布");
		payload.put("preheader", StrUtil.sub(body.replaceAll("\\s+", " ").trim(), 0, 120));
		payload.put("bodyHtml", "<div style=\"font-family:sans-serif;line-height:1.6\">"
			+ "<h2>Kotion " + escapeHtml(tag) + " 已发布</h2>"
			+ "<div>" + body + "</div>"
			+ "<p><a href=\"" + escapeHtml(link) + "\">查看完整更新</a></p>"
			+ "<p style=\"color:#888;font-size:12px\"><a href=\"{{unsubscribe_url}}\">退订</a></p>"
			+ "{{open_pixel}}"
			+ "</div>");
		payload.put("status", "DRAFT");
		Map<String, Object> audience = new LinkedHashMap<>(1);
		audience.put("status", "subscribed");
		payload.put("audience", audience);

		Map<String, Object> created = campaignService.create(payload);
		recordAudit("CREATE", "CAMPAIGN", String.valueOf(created.get("id")),
			"从更新日志生成邮件草稿：" + name, null);
		return R.data(created);
	}

	// ---------- 辅助 ----------

	private void recordAudit(String action, String targetType, String targetKey, String summary, Object detail) {
		String detailJson = null;
		if (detail != null) {
			try {
				detailJson = JSONUtil.toJsonStr(detail);
			} catch (Exception e) {
				detailJson = String.valueOf(detail);
			}
		}
		opsAuditService.record(operator(null), operatorId(), action, targetType, targetKey, summary, detailJson,
			clientIp());
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

	private Long operatorId() {
		return getUser() == null ? null : getUser().getUserId();
	}

	private String clientIp() {
		try {
			return WebUtil.getIP(getRequest());
		} catch (Exception e) {
			return null;
		}
	}

	private static long pageNo(Long current) {
		return current == null || current <= 0 ? 1L : current;
	}

	private static long pageSize(Long size) {
		return size == null || size <= 0 ? 20L : size;
	}

	private static int indexOf(List<String> headers, String name) {
		if (headers == null) {
			return -1;
		}
		for (int i = 0; i < headers.size(); i++) {
			if (name.equalsIgnoreCase(StrUtil.trimToEmpty(headers.get(i)))) {
				return i;
			}
		}
		return -1;
	}

	private static String cell(List<String> cells, int index) {
		if (cells == null || index < 0 || index >= cells.size()) {
			return "";
		}
		return cells.get(index);
	}

	private static String blankToNull(String value) {
		return StrUtil.isBlank(value) ? null : value;
	}

	private static String stringValue(Object value) {
		return value == null ? "" : String.valueOf(value);
	}

	private static Long toLong(Object value) {
		if (value == null) {
			return null;
		}
		if (value instanceof Number) {
			return ((Number) value).longValue();
		}
		try {
			return Long.valueOf(String.valueOf(value).trim());
		} catch (NumberFormatException e) {
			return null;
		}
	}

	private static long toLongValue(Object value) {
		Long result = toLong(value);
		return result == null ? 0L : result;
	}

	private static String escapeHtml(String value) {
		if (value == null) {
			return "";
		}
		return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
			.replace("\"", "&quot;").replace("'", "&#39;");
	}

	/**
	 * 极简 CSV 解析：支持双引号包裹与 {@code ""} 转义，兼容 CRLF/LF。
	 */
	private static List<List<String>> parseCsv(String text) {
		List<List<String>> rows = new ArrayList<>();
		if (StrUtil.isBlank(text)) {
			return rows;
		}
		String source = text.replace("\r\n", "\n").replace('\r', '\n');
		List<String> current = new ArrayList<>();
		StringBuilder field = new StringBuilder();
		boolean quoted = false;
		for (int i = 0; i < source.length(); i++) {
			char c = source.charAt(i);
			if (quoted) {
				if (c == '"') {
					if (i + 1 < source.length() && source.charAt(i + 1) == '"') {
						field.append('"');
						i++;
					} else {
						quoted = false;
					}
				} else {
					field.append(c);
				}
				continue;
			}
			if (c == '"') {
				quoted = true;
			} else if (c == ',') {
				current.add(field.toString());
				field.setLength(0);
			} else if (c == '\n') {
				current.add(field.toString());
				field.setLength(0);
				rows.add(current);
				current = new ArrayList<>();
			} else {
				field.append(c);
			}
		}
		current.add(field.toString());
		rows.add(current);

		List<List<String>> result = new ArrayList<>(rows.size());
		for (int i = 0; i < rows.size(); i++) {
			List<String> row = rows.get(i);
			if (i == 0 && !row.isEmpty()) {
				row.set(0, stripBom(row.get(0)));
			}
			boolean blank = true;
			for (String value : row) {
				if (!StrUtil.isBlank(value)) {
					blank = false;
					break;
				}
			}
			if (!blank) {
				result.add(row);
			}
		}
		return result;
	}

	private static String stripBom(String value) {
		return value != null && value.startsWith("\uFEFF") ? value.substring(1) : value;
	}
}
