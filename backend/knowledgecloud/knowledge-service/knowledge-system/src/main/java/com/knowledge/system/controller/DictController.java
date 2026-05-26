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
import com.knowledge.core.mp.support.Condition;
import com.knowledge.core.mp.support.Query;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.node.INode;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.entity.Dict;
import com.knowledge.system.service.IDictService;
import com.knowledge.system.vo.DictVO;
import com.knowledge.system.wrapper.DictWrapper;
import io.swagger.annotations.*;
import lombok.AllArgsConstructor;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;
import java.util.List;
import java.util.Map;

/**
 * 字典控制器
 *
 * @author Chill
 */
@RestController
@AllArgsConstructor
@RequestMapping("/dict")
@Api(value = "字典", tags = "字典")
public class DictController extends KnowledgeController {

	private IDictService dictService;

	/**
	 * 详情
	 */
	@GetMapping("/detail")
	@ApiOperationSupport(order = 1)
	@ApiOperation(value = "详情", notes = "传入dict")
	public R<DictVO> detail(Dict dict) {
		Dict detail = dictService.getOne(Condition.getQueryWrapper(dict));
		return R.data(DictWrapper.build().entityVO(detail));
	}

	/**
	 * 列表
	 */
	@GetMapping("/list")
	@ApiOperationSupport(order = 2)
	@ApiOperation(value = "列表", notes = "传入dict")
	public R<List<DictVO>> list(@RequestParam Map<String, Object> dict) {
		List<Dict> list = dictService.list(Condition.getQueryWrapper(dict, Dict.class));
		return R.data(DictWrapper.build().listNodeVO(list));
	}

	/**
	 * 顶级列表
	 */
	@GetMapping("/parent-list")
	@ApiOperationSupport(order = 3)
	@ApiOperation(value = "列表", notes = "传入dict")
	public R<IPage<Dict>> parentList(@RequestParam Map<String, Object> dict, Query query) {
		return R.data(dictService.page(Condition.getPage(query), Condition.getQueryWrapper(dict, Dict.class)));
	}

	/**
	 * 子列表
	 */
	@GetMapping("/child-list")
	@ApiOperationSupport(order = 4)
	@ApiOperation(value = "列表", notes = "传入dict")
	public R<IPage<Dict>> childList(@RequestParam Map<String, Object> dict,
			@RequestParam(required = false, defaultValue = "-1") Long parentId, Query query) {
		return R.data(dictService.page(Condition.getPage(query),
				Condition.getQueryWrapper(dict, Dict.class).lambda().eq(Dict::getParentId, parentId)));
	}

	/**
	 * 获取字典树形结构
	 *
	 * @return
	 */
	@GetMapping("/tree")
	@ApiOperationSupport(order = 5)
	@ApiOperation(value = "树形结构", notes = "树形结构")
	public R<List<DictVO>> tree() {
		List<DictVO> tree = dictService.tree("");
		return R.data(tree);
	}

	/**
	 * 获取字典树形结构根据code
	 *
	 * @param code 字典编号
	 * @return
	 */
	@GetMapping("/tree-by-code")
	@ApiOperationSupport(order = 6)
	@ApiOperation(value = "树形结构", notes = "树形结构")
	public R<List<DictVO>> treeByCode(@RequestParam String code) {
		List<DictVO> tree = dictService.tree(code);
		return R.data(tree);
	}

	/**
	 * 新增或修改
	 */
	@PostMapping("/submit")
	@ApiOperationSupport(order = 7)
	@ApiOperation(value = "新增或修改", notes = "传入dict")
	public R submit(@Valid @RequestBody Dict dict) {
		return R.status(dictService.submit(dict));
	}

	/**
	 * 删除
	 */
	@PostMapping("/remove")
	@ApiOperationSupport(order = 8)
	@ApiOperation(value = "删除", notes = "传入ids")
	public R remove(@ApiParam(value = "主键集合", required = true) @RequestParam String ids) {
		return R.status(dictService.removeByIds(Func.toLongList(ids)));
	}

	/**
	 * 获取字典
	 */
	@GetMapping("/dictionary")
	@ApiOperationSupport(order = 9)
	@ApiOperation(value = "获取字典", notes = "获取字典")
	public R<List<Dict>> dictionary(@RequestParam String code) {
		List<Dict> list = dictService.getList(code);
		return R.data(list);
	}

}
