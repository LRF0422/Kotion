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
package com.knowledge.core.log.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.AllArgsConstructor;

import com.knowledge.core.log.converter.LogErrorConverter;
import com.knowledge.core.log.entity.LogErrorDO;
import com.knowledge.core.log.model.LogError;
import com.knowledge.core.log.model.LogErrorVo;
import com.knowledge.core.log.service.ILogErrorService;
import com.knowledge.core.mp.support.Condition;
import com.knowledge.core.mp.support.Query;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.core.tool.utils.BeanUtil;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.core.tool.utils.StringPool;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import springfox.documentation.annotations.ApiIgnore;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 控制器
 *
 * @author Chill
 * @since 2018-09-26
 */
@RestController
@AllArgsConstructor
@RequestMapping("/error")
@PreAuthorize("(hasRole('platform.audit.read') or " + RoleConstant.HAS_ROLE_ADMIN
		+ ") and principal.clientId == 'kotion-platform-admin'")
public class LogErrorController {

	private ILogErrorService errorLogService;

	/**
	 * 查询单条
	 */
	@GetMapping("/detail")
	public R<LogErrorVo> detail(LogError logError) {
		return R.data(
				LogErrorConverter.INSTANCE.convertVO(errorLogService
						.getOne(Condition.getQueryWrapper(LogErrorConverter.INSTANCE.convertDO(logError)))));
	}

	/**
	 * 查询多条(分页)
	 */
	@GetMapping("/list")
	public R<IPage<LogErrorVo>> list(@ApiIgnore @RequestParam Map<String, Object> logError, Query query) {
		query.setAscs("create_time");
		query.setDescs(StringPool.EMPTY);
		IPage<LogErrorDO> pages = errorLogService.page(Condition.<LogErrorDO>getPage(query),
				Condition.getQueryWrapper(logError, LogErrorDO.class));
		List<LogErrorVo> records = pages.getRecords().stream().map(logApi -> {
			LogErrorVo vo = BeanUtil.copy(logApi, LogErrorVo.class);
			vo.setStrId(Func.toStr(logApi.getId()));
			return vo;
		}).collect(Collectors.toList());
		IPage<LogErrorVo> pageVo = new Page<>(pages.getCurrent(), pages.getSize(),
				pages.getTotal());
		pageVo.setRecords(records);
		return R.data(pageVo);
	}

}
