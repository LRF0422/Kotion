/**
 * Copyright (c) 2018-2028, Chill Zhuang 庄骞 (smallchill@163.com).
 * <p>
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * <p>
 * http://www.apache.org/licenses/LICENSE-2.0
 * <p>
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.knowledge.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.github.xiaoymin.knife4j.annotations.ApiOperationSupport;
import com.knowledge.core.boot.ctrl.KnowledgeController;
import io.swagger.annotations.*;
import lombok.AllArgsConstructor;
import com.knowledge.core.mp.support.Condition;
import com.knowledge.core.mp.support.Query;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.domain.Param;
import com.knowledge.system.service.IParamService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import springfox.documentation.annotations.ApiIgnore;

import javax.validation.Valid;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 控制器
 *
 * @author Chill
 */
@RestController
@AllArgsConstructor
@RequestMapping("/param")
@PreAuthorize("hasRole('service') or ((hasRole('platform.settings.manage') or "
        + RoleConstant.HAS_ROLE_ADMIN + ") and principal.clientId == 'kotion-platform-admin')")
@Api(value = "参数管理", tags = "接口")
public class ParamController extends KnowledgeController {

	private IParamService paramService;

	/**
	 * 详情
	 */
	@GetMapping("/detail")
	@ApiOperationSupport(order = 1)
	@ApiOperation(value = "详情", notes = "传入param")
	public R<Param> detail(Param param) {
		Param detail = paramService.getOne(Condition.getQueryWrapper(param));
		maskSensitiveValue(detail);
		return R.data(detail);
	}

	@GetMapping("/value")
	public R<String> value(@RequestParam("paramKey") String paramKey) {
		return R.data(isSensitiveKey(paramKey) ? null : paramService.getParamValue(paramKey));
	}

	/**
	 * 分页
	 */
	@GetMapping("/list")
	@ApiImplicitParams({
		@ApiImplicitParam(name = "paramName", value = "参数名称", paramType = "query", dataType = "string"),
		@ApiImplicitParam(name = "paramKey", value = "参数键名", paramType = "query", dataType = "string"),
		@ApiImplicitParam(name = "paramValue", value = "参数键值", paramType = "query", dataType = "string")
	})
	@ApiOperationSupport(order = 2)
	@ApiOperation(value = "分页", notes = "传入param")
	public R<IPage<Param>> list(@ApiIgnore @RequestParam Map<String, Object> param, Query query) {
		IPage<Param> pages = paramService.page(Condition.getPage(query), Condition.getQueryWrapper(param, Param.class));
		pages.getRecords().forEach(this::maskSensitiveValue);
		return R.data(pages);
	}

	@GetMapping("/ai/value")
	@PreAuthorize("(hasRole('platform.ai.config.manage') or " + RoleConstant.HAS_ROLE_ADMIN
			+ ") and principal.clientId == 'kotion-platform-admin'")
	public R<String> aiValue(@RequestParam("paramKey") String paramKey) {
		requireAiKey(paramKey);
		return R.data(isSensitiveKey(paramKey) ? null : paramService.getParamValue(paramKey));
	}

	@GetMapping("/ai/list")
	@PreAuthorize("(hasRole('platform.ai.config.manage') or " + RoleConstant.HAS_ROLE_ADMIN
			+ ") and principal.clientId == 'kotion-platform-admin'")
	public R<List<Param>> aiList() {
		List<Param> params = paramService.lambdaQuery().likeRight(Param::getParamKey, "ai.").list();
		params.forEach(this::maskSensitiveValue);
		return R.data(params);
	}

	@PostMapping("/ai/submit")
	@PreAuthorize("(hasRole('platform.ai.config.manage') or " + RoleConstant.HAS_ROLE_ADMIN
			+ ") and principal.clientId == 'kotion-platform-admin'")
	public R aiSubmit(@Valid @RequestBody Param param) {
		requireAiKey(param.getParamKey());
		if (param.getId() != null) {
			Param existing = paramService.getById(param.getId());
			if (existing == null || !param.getParamKey().equals(existing.getParamKey())) {
				throw new IllegalArgumentException("参数 ID 与 ai.* 键不匹配");
			}
		}
		return R.status(paramService.saveOrUpdate(param));
	}

	/**
	 * 新增或修改
	 */
	@PreAuthorize("(hasRole('platform.settings.manage') or " + RoleConstant.HAS_ROLE_ADMIN
			+ ") and principal.clientId == 'kotion-platform-admin'")
	@PostMapping("/submit")
	@ApiOperationSupport(order = 3)
	@ApiOperation(value = "新增或修改", notes = "传入param")
	public R submit(@Valid @RequestBody Param param) {
		return R.status(paramService.saveOrUpdate(param));
	}


	/**
	 * 删除
	 */
	@PreAuthorize("(hasRole('platform.settings.manage') or " + RoleConstant.HAS_ROLE_ADMIN
			+ ") and principal.clientId == 'kotion-platform-admin'")
	@PostMapping("/remove")
	@ApiOperationSupport(order = 4)
	@ApiOperation(value = "逻辑删除", notes = "传入ids")
	public R remove(@ApiParam(value = "主键集合", required = true) @RequestParam String ids) {
		return R.status(paramService.removeBatchByIds(Func.toLongList(ids)));
	}

	private void requireAiKey(String paramKey) {
		if (paramKey == null || !paramKey.startsWith("ai.")) {
			throw new IllegalArgumentException("仅允许管理 ai.* 参数");
		}
	}

	private void maskSensitiveValue(Param param) {
		if (param != null && isSensitiveKey(param.getParamKey())) {
			param.setParamValue(null);
		}
	}

	private boolean isSensitiveKey(String paramKey) {
		if (paramKey == null) return false;
		String normalized = paramKey.toLowerCase(Locale.ROOT);
		return normalized.contains("apikey")
				|| normalized.contains("api_key")
				|| normalized.contains("secret")
				|| normalized.contains("password")
				|| normalized.endsWith(".token")
				|| normalized.contains("credential");
	}

}
