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
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import io.swagger.annotations.ApiParam;
import lombok.AllArgsConstructor;
import com.knowledge.core.mp.support.Condition;
import com.knowledge.core.mp.support.Query;
import org.springframework.security.access.prepost.PreAuthorize;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.domain.AuthApp;
import com.knowledge.system.service.IAuthClientService;

import org.springframework.web.bind.annotation.*;
import springfox.documentation.annotations.ApiIgnore;

import javax.validation.Valid;
import java.util.List;

/**
 * 应用管理控制器
 *
 * @author Chill
 */
@RestController
@AllArgsConstructor
@RequestMapping("/client")
@ApiIgnore
@Api(value = "应用管理", tags = "接口")
@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
public class AuthClientController extends KnowledgeController {

	private IAuthClientService clientService;

	/**
	 * 详情
	 */
	@GetMapping("/detail")
	@ApiOperationSupport(order = 1)
	@ApiOperation(value = "详情", notes = "传入client")
	public R<AuthApp> detail(AuthApp authClient) {
		AuthApp detail = clientService.getOne(Condition.getQueryWrapper(authClient));
		return R.data(detail);
	}

	/**
	 * 分页
	 */
	@GetMapping("/list")
	@ApiOperationSupport(order = 2)
	@ApiOperation(value = "分页", notes = "传入client")
	public R<IPage<AuthApp>> list(AuthApp authClient, Query query) {
		IPage<AuthApp> pages = clientService.page(Condition.getPage(query), Condition.getQueryWrapper(authClient));
		return R.data(pages);
	}

	@GetMapping("/listAll")
	@ApiOperationSupport(order = 2)
	public R<List<AuthApp>> listAll() {
		List<AuthApp> pages = this.clientService.list();
		return R.data(pages);
	}

	/**
	 * 新增
	 */
	@PostMapping("/save")
	@ApiOperationSupport(order = 3)
	@ApiOperation(value = "新增", notes = "传入client")
	public R save(@Valid @RequestBody AuthApp authClient) {
		return R.status(clientService.save(authClient));
	}

	/**
	 * 修改
	 */
	@PostMapping("/update")
	@ApiOperationSupport(order = 4)
	@ApiOperation(value = "修改", notes = "传入client")
	public R update(@Valid @RequestBody AuthApp authClient) {
		return R.status(clientService.updateById(authClient));
	}

	/**
	 * 新增或修改
	 */
	@PostMapping("/submit")
	@ApiOperationSupport(order = 5)
	@ApiOperation(value = "新增或修改", notes = "传入client")
	public R submit(@Valid @RequestBody AuthApp authClient) {
		return R.status(clientService.saveOrUpdate(authClient));
	}

	/**
	 * 删除
	 */
	@PostMapping("/remove")
	@ApiOperationSupport(order = 6)
	@ApiOperation(value = "逻辑删除", notes = "传入ids")
	public R remove(@ApiParam(value = "主键集合", required = true) @RequestParam String ids) {
		return R.status(clientService.removeBatchByIds(Func.toLongList(ids)));
	}

}
