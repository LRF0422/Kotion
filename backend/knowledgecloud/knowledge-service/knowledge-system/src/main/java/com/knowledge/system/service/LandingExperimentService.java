package com.knowledge.system.service;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.LandingExperiment;
import com.knowledge.system.domain.LandingExperimentExposure;
import com.knowledge.system.domain.LandingExperimentVariant;
import com.knowledge.system.mapper.LandingExperimentExposureMapper;
import com.knowledge.system.mapper.LandingExperimentMapper;
import com.knowledge.system.mapper.LandingExperimentVariantMapper;
import com.knowledge.system.mapper.LandingOpsMapper;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A/B 实验（P1-8）。
 *
 * <p>分流由前端 {@code useExperiment} 依据 visitorId 稳定计算，服务端只负责
 * 配置下发、曝光登记与结果聚合。曝光表对 (site, exp, visitor) 唯一，
 * 保证同一访客只计一次。</p>
 */
@Service
@AllArgsConstructor
public class LandingExperimentService {

	public static final String DEFAULT_SITE_ID = "kotion-landing";
	private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");
	private static final int DEFAULT_TRAFFIC_SPLIT = 100;

	private final LandingExperimentMapper experimentMapper;
	private final LandingExperimentVariantMapper variantMapper;
	private final LandingExperimentExposureMapper exposureMapper;
	private final LandingOpsMapper opsMapper;
	private final com.knowledge.system.mapper.LandingOpsExperimentMapper opsMapperExperiment;

	/**
	 * 把一批 {variantKey, exposures/conversions} 结果按变体合并，同类计数取较大值。
	 */
	private static void mergeCounts(Map<String, Map<String, Object>> target, List<Map<String, Object>> rows) {
		if (rows == null) {
			return;
		}
		for (Map<String, Object> row : rows) {
			Object keyValue = row.get("variantKey");
			if (keyValue == null) {
				continue;
			}
			String key = String.valueOf(keyValue);
			Map<String, Object> bucket = target.get(key);
			if (bucket == null) {
				bucket = new HashMap<>();
				bucket.put("variantKey", key);
				bucket.put("exposures", 0L);
				bucket.put("conversions", 0L);
				target.put(key, bucket);
			}
			bucket.put("exposures", Math.max(toLong(bucket.get("exposures")), toLong(row.get("exposures"))));
			bucket.put("conversions", Math.max(toLong(bucket.get("conversions")), toLong(row.get("conversions"))));
		}
	}

	// ---------- 管理端 ----------

	public List<Map<String, Object>> list() {
		List<LandingExperiment> rows = experimentMapper.selectList(Wrappers.<LandingExperiment>lambdaQuery()
			.orderByDesc(LandingExperiment::getId));
		List<Map<String, Object>> result = new ArrayList<>(rows.size());
		for (LandingExperiment row : rows) {
			result.add(toMap(row));
		}
		return result;
	}

	public Map<String, Object> create(Map<String, Object> body) {
		LandingExperiment row = new LandingExperiment();
		row.setSiteId(DEFAULT_SITE_ID);
		apply(row, body, true);
		long count = experimentMapper.selectCount(Wrappers.<LandingExperiment>lambdaQuery()
			.eq(LandingExperiment::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingExperiment::getExpKey, row.getExpKey()));
		if (count > 0) {
			throw new ServiceException("实验标识已存在：" + row.getExpKey());
		}
		LocalDateTime now = LocalDateTime.now();
		row.setCreateTime(now);
		row.setUpdateTime(now);
		experimentMapper.insert(row);
		applyVariants(row.getId(), readVariants(body.get("variants")));
		return toMap(row);
	}

	public Map<String, Object> update(Long id, Map<String, Object> body) {
		LandingExperiment row = experimentMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("实验不存在");
		}
		apply(row, body, false);
		row.setUpdateTime(LocalDateTime.now());
		experimentMapper.updateById(row);
		if (body.get("variants") != null) {
			applyVariants(id, readVariants(body.get("variants")));
		}
		return toMap(row);
	}

	@Transactional(rollbackFor = Exception.class)
	public Map<String, Object> saveVariants(Long id, Map<String, Object> body) {
		LandingExperiment row = experimentMapper.selectById(id);
		if (row == null) {
			throw new ServiceException("实验不存在");
		}
		applyVariants(id, readVariants(body.get("variants")));
		return toMap(row);
	}

	@Transactional(rollbackFor = Exception.class)
	public void delete(Long id) {
		variantMapper.delete(Wrappers.<LandingExperimentVariant>lambdaQuery()
			.eq(LandingExperimentVariant::getExperimentId, id));
		experimentMapper.deleteById(id);
	}

	/**
	 * 结果聚合：曝光 / 转化 / 转化率 / 相对对照提升 / 优于对照概率。
	 *
	 * <p>曝光与转化各有两条上报路径（埋点事件 / 显式 exposure 接口），
	 * 这里按变体取两者的较大值，避免同一批访客被重复计数。</p>
	 */
	public Map<String, Object> results(String expKey, int days) {
		LandingExperiment experiment = experimentMapper.selectOne(Wrappers.<LandingExperiment>lambdaQuery()
			.eq(LandingExperiment::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingExperiment::getExpKey, expKey)
			.last("LIMIT 1"));
		if (experiment == null) {
			throw new ServiceException("实验不存在：" + expKey);
		}
		String startDay = LocalDate.now().minusDays(Math.max(days, 1) - 1L).format(DAY);
		Map<String, Map<String, Object>> byVariant = new HashMap<>();
		// 来源一：显式 exposure 表
		mergeCounts(byVariant, opsMapper.selectExperimentResults(DEFAULT_SITE_ID, expKey, startDay));
		// 来源二：埋点事件（experiment_exposure / experiment_conversion）
		mergeCounts(byVariant, opsMapperExperiment.selectExposuresFromEvents(DEFAULT_SITE_ID, expKey, startDay));
		mergeCounts(byVariant, opsMapperExperiment.selectConversionsFromEvents(DEFAULT_SITE_ID, expKey, startDay));
		List<LandingExperimentVariant> variants = variantsOf(experiment.getId());

		double controlRate = 0d;
		for (LandingExperimentVariant variant : variants) {
			if (Boolean.TRUE.equals(variant.getIsControl())) {
				Map<String, Object> row = byVariant.get(variant.getVariantKey());
				long exposures = toLong(row == null ? null : row.get("exposures"));
				long conversions = toLong(row == null ? null : row.get("conversions"));
				controlRate = rate(conversions, exposures);
			}
		}

		List<Map<String, Object>> variantResults = new ArrayList<>();
		for (LandingExperimentVariant variant : variants) {
			Map<String, Object> row = byVariant.get(variant.getVariantKey());
			long exposures = toLong(row == null ? null : row.get("exposures"));
			long conversions = toLong(row == null ? null : row.get("conversions"));
			double conversionRate = rate(conversions, exposures);
			Map<String, Object> item = new LinkedHashMap<>(8);
			item.put("variantKey", variant.getVariantKey());
			item.put("name", variant.getName());
			item.put("isControl", variant.getIsControl());
			item.put("exposures", exposures);
			item.put("conversions", conversions);
			item.put("conversionRate", conversionRate);
			item.put("lift", controlRate <= 0 ? 0d : round2((conversionRate - controlRate) * 100d / controlRate));
			item.put("probabilityToBeatControl", probabilityToBeatControl(conversions, exposures, controlRate));
			variantResults.add(item);
		}

		Map<String, Object> result = new LinkedHashMap<>(3);
		result.put("expKey", experiment.getExpKey());
		result.put("metricEvent", experiment.getMetricEvent());
		result.put("variants", variantResults);
		return result;
	}

	// ---------- 公开端 ----------

	/**
	 * 下发给落地页的运行中实验（含分组与权重）。
	 */
	public List<Map<String, Object>> running() {
		List<LandingExperiment> rows = experimentMapper.selectList(Wrappers.<LandingExperiment>lambdaQuery()
			.eq(LandingExperiment::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingExperiment::getStatus, "RUNNING")
			.orderByAsc(LandingExperiment::getId));
		List<Map<String, Object>> result = new ArrayList<>(rows.size());
		LocalDateTime now = LocalDateTime.now();
		for (LandingExperiment row : rows) {
			if (row.getStartTime() != null && now.isBefore(row.getStartTime())) {
				continue;
			}
			if (row.getEndTime() != null && now.isAfter(row.getEndTime())) {
				continue;
			}
			List<LandingExperimentVariant> variants = variantsOf(row.getId());
			if (variants.isEmpty()) {
				continue;
			}
			Map<String, Object> item = new LinkedHashMap<>(6);
			item.put("expKey", row.getExpKey());
			item.put("name", row.getName());
			item.put("trafficSplit", row.getTrafficSplit() == null ? DEFAULT_TRAFFIC_SPLIT : row.getTrafficSplit());
			item.put("metricEvent", row.getMetricEvent());
			List<Map<String, Object>> variantList = new ArrayList<>(variants.size());
			for (LandingExperimentVariant variant : variants) {
				Map<String, Object> v = new LinkedHashMap<>(5);
				v.put("variantKey", variant.getVariantKey());
				v.put("name", variant.getName());
				v.put("weight", variant.getWeight());
				v.put("isControl", variant.getIsControl());
				v.put("payload", parsePayload(variant.getPayload()));
				variantList.add(v);
			}
			item.put("variants", variantList);
			result.add(item);
		}
		return result;
	}

	/**
	 * 登记一次曝光（幂等：同一访客同一实验只写一行）。
	 */
	@Transactional(rollbackFor = Exception.class)
	public void recordExposure(String expKey, String variantKey, String visitorId, String sessionId) {
		if (StrUtil.isBlank(expKey) || StrUtil.isBlank(variantKey) || StrUtil.isBlank(visitorId)) {
			return;
		}
		long exists = exposureMapper.selectCount(Wrappers.<LandingExperimentExposure>lambdaQuery()
			.eq(LandingExperimentExposure::getSiteId, DEFAULT_SITE_ID)
			.eq(LandingExperimentExposure::getExpKey, expKey)
			.eq(LandingExperimentExposure::getVisitorId, visitorId));
		if (exists > 0) {
			return;
		}
		LandingExperimentExposure row = new LandingExperimentExposure();
		row.setSiteId(DEFAULT_SITE_ID);
		row.setExpKey(StrUtil.sub(expKey, 0, 64));
		row.setVariantKey(StrUtil.sub(variantKey, 0, 32));
		row.setVisitorId(StrUtil.sub(visitorId, 0, 64));
		row.setSessionId(StrUtil.sub(sessionId, 0, 64));
		row.setConverted(false);
		row.setStatDay(LocalDate.now());
		LocalDateTime now = LocalDateTime.now();
		row.setCreateTime(now);
		row.setUpdateTime(now);
		exposureMapper.insert(row);
	}

	/**
	 * 标记某访客在某实验内完成转化。
	 */
	@Transactional(rollbackFor = Exception.class)
	public void recordConversion(String expKey, String visitorId, String metric) {
		if (StrUtil.isBlank(expKey) || StrUtil.isBlank(visitorId)) {
			return;
		}
		LandingExperimentExposure row = exposureMapper.selectOne(
			Wrappers.<LandingExperimentExposure>lambdaQuery()
				.eq(LandingExperimentExposure::getSiteId, DEFAULT_SITE_ID)
				.eq(LandingExperimentExposure::getExpKey, expKey)
				.eq(LandingExperimentExposure::getVisitorId, visitorId)
				.last("LIMIT 1"));
		if (row == null || Boolean.TRUE.equals(row.getConverted())) {
			return;
		}
		row.setConverted(true);
		row.setConversionEvent(StrUtil.sub(metric, 0, 64));
		row.setUpdateTime(LocalDateTime.now());
		exposureMapper.updateById(row);
	}

	// ---------- 内部 ----------

	private List<LandingExperimentVariant> variantsOf(Long experimentId) {
		return variantMapper.selectList(Wrappers.<LandingExperimentVariant>lambdaQuery()
			.eq(LandingExperimentVariant::getExperimentId, experimentId)
			.orderByAsc(LandingExperimentVariant::getPosition)
			.orderByAsc(LandingExperimentVariant::getId));
	}

	private void applyVariants(Long experimentId, List<Map<String, Object>> variants) {
		variantMapper.delete(Wrappers.<LandingExperimentVariant>lambdaQuery()
			.eq(LandingExperimentVariant::getExperimentId, experimentId));
		int position = 0;
		for (Map<String, Object> item : variants) {
			String key = StrUtil.trimToEmpty(stringValue(item.get("variantKey")));
			if (key.isEmpty()) {
				continue;
			}
			LandingExperimentVariant row = new LandingExperimentVariant();
			row.setExperimentId(experimentId);
			row.setVariantKey(StrUtil.sub(key, 0, 32));
			row.setName(StrUtil.sub(stringValue(item.get("name")), 0, 128));
			row.setWeight(item.get("weight") == null ? 50 : Integer.valueOf(stringValue(item.get("weight"))));
			row.setIsControl(Boolean.valueOf(stringValue(item.get("isControl"))));
			Object payload = item.get("payload");
			row.setPayload(payload == null ? "{}" : (payload instanceof String ? (String) payload : JSONUtil.toJsonStr(payload)));
			row.setPosition(position++);
			LocalDateTime now = LocalDateTime.now();
			row.setCreateTime(now);
			row.setUpdateTime(now);
			variantMapper.insert(row);
		}
	}

	@SuppressWarnings("unchecked")
	private List<Map<String, Object>> readVariants(Object raw) {
		List<Map<String, Object>> variants = new ArrayList<>();
		if (raw instanceof List) {
			for (Object item : (List<Object>) raw) {
				if (item instanceof Map) {
					variants.add((Map<String, Object>) item);
				}
			}
		}
		return variants;
	}

	private Map<String, Object> toMap(LandingExperiment row) {
		Map<String, Object> item = new LinkedHashMap<>(12);
		item.put("id", row.getId());
		item.put("expKey", row.getExpKey());
		item.put("name", row.getName());
		item.put("hypothesis", row.getHypothesis());
		item.put("status", row.getStatus());
		item.put("trafficSplit", row.getTrafficSplit());
		item.put("metricEvent", row.getMetricEvent());
		item.put("guardrailNote", row.getGuardrailNote());
		item.put("startTime", row.getStartTime());
		item.put("endTime", row.getEndTime());
		List<Map<String, Object>> variants = new ArrayList<>();
		for (LandingExperimentVariant variant : variantsOf(row.getId())) {
			Map<String, Object> v = new LinkedHashMap<>(6);
			v.put("id", variant.getId());
			v.put("variantKey", variant.getVariantKey());
			v.put("name", variant.getName());
			v.put("weight", variant.getWeight());
			v.put("isControl", variant.getIsControl());
			v.put("payload", parsePayload(variant.getPayload()));
			v.put("position", variant.getPosition());
			variants.add(v);
		}
		item.put("variants", variants);
		return item;
	}

	private Object parsePayload(String json) {
		if (StrUtil.isBlank(json)) {
			return new LinkedHashMap<String, Object>();
		}
		try {
			JSONObject object = JSONUtil.parseObj(json);
			Map<String, Object> map = new LinkedHashMap<>();
			for (Map.Entry<String, Object> entry : object.entrySet()) {
				map.put(entry.getKey(), entry.getValue());
			}
			return map;
		} catch (Exception e) {
			return new LinkedHashMap<String, Object>();
		}
	}

	private void apply(LandingExperiment row, Map<String, Object> body, boolean creating) {
		if (creating || StrUtil.isNotBlank(stringValue(body.get("expKey")))) {
			String key = StrUtil.trimToEmpty(stringValue(body.get("expKey")));
			if (key.isEmpty()) {
				throw new ServiceException("实验标识不能为空");
			}
			row.setExpKey(StrUtil.sub(key.replaceAll("[^a-zA-Z0-9_.-]", "-"), 0, 64));
		}
		if (body.get("name") != null) {
			row.setName(StrUtil.sub(stringValue(body.get("name")), 0, 128));
		}
		if (body.get("hypothesis") != null) {
			row.setHypothesis(StrUtil.sub(stringValue(body.get("hypothesis")), 0, 512));
		}
		row.setStatus(normalizeStatus(stringValue(body.get("status"))));
		if (body.get("trafficSplit") != null) {
			int split = Integer.parseInt(stringValue(body.get("trafficSplit")));
			row.setTrafficSplit(Math.max(0, Math.min(100, split)));
		} else if (row.getTrafficSplit() == null) {
			row.setTrafficSplit(DEFAULT_TRAFFIC_SPLIT);
		}
		if (body.get("metricEvent") != null) {
			row.setMetricEvent(StrUtil.sub(stringValue(body.get("metricEvent")), 0, 64));
		} else if (row.getMetricEvent() == null) {
			row.setMetricEvent("cta_click");
		}
		if (body.get("guardrailNote") != null) {
			row.setGuardrailNote(StrUtil.sub(stringValue(body.get("guardrailNote")), 0, 255));
		}
		row.setStartTime(parseDateTime(body.get("startTime")));
		row.setEndTime(parseDateTime(body.get("endTime")));
		if (StrUtil.isBlank(row.getName())) {
			throw new ServiceException("实验名称不能为空");
		}
	}

	private String normalizeStatus(String status) {
		String value = StrUtil.trimToEmpty(status).toUpperCase();
		if ("RUNNING".equals(value) || "PAUSED".equals(value) || "FINISHED".equals(value)) {
			return value;
		}
		return "DRAFT";
	}

	private LocalDateTime parseDateTime(Object value) {
		String text = StrUtil.trimToEmpty(stringValue(value));
		if (text.isEmpty()) {
			return null;
		}
		try {
			return LocalDateTime.parse(text.replace("Z", "").replace(" ", "T"));
		} catch (Exception e) {
			return null;
		}
	}

	private static String stringValue(Object value) {
		return value == null ? "" : String.valueOf(value);
	}

	private static long toLong(Object value) {
		if (value == null) {
			return 0L;
		}
		if (value instanceof Number) {
			return ((Number) value).longValue();
		}
		try {
			return Long.parseLong(String.valueOf(value));
		} catch (NumberFormatException e) {
			return 0L;
		}
	}

	private static double rate(long numerator, long denominator) {
		if (denominator <= 0) {
			return 0d;
		}
		return BigDecimal.valueOf(numerator * 100d / denominator).setScale(4, RoundingMode.HALF_UP).doubleValue();
	}

	private static double round2(double value) {
		return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
	}

	/**
	 * 用两比例 z 检验的近似正态 CDF 估算「优于对照组的概率」。
	 * 样本量不足时返回 50，表示尚无结论。
	 */
	private static double probabilityToBeatControl(long conversions, long exposures, double controlRate) {
		if (exposures < 30 || controlRate <= 0 || controlRate >= 100) {
			return 50d;
		}
		double p1 = controlRate / 100d;
		double p2 = conversions / (double) exposures;
		double pooled = (p1 + p2) / 2d;
		double standardError = Math.sqrt(pooled * (1 - pooled) * (2d / exposures));
		if (standardError <= 0) {
			return 50d;
		}
		double z = (p2 - p1) / standardError;
		return round2(normalCdf(z) * 100d);
	}

	/** 标准正态分布 CDF 的 Abramowitz-Stegun 近似。 */
	private static double normalCdf(double z) {
		double t = 1d / (1d + 0.2316419 * Math.abs(z));
		double d = 0.3989422804014327 * Math.exp(-z * z / 2d);
		double p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
		return z >= 0 ? 1d - p : p;
	}
}
