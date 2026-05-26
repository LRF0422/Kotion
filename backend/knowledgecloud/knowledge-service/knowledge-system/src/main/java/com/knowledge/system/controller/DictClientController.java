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

import com.knowledge.core.tool.api.R;
import com.knowledge.system.entity.Dict;
import com.knowledge.system.service.IDictService;
import lombok.AllArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import springfox.documentation.annotations.ApiIgnore;

import java.util.List;

/**
 * 字典服务Feign实现类
 *
 * @author Chill
 */
@ApiIgnore
@RestController
@AllArgsConstructor
@RequestMapping("/dict")
public class DictClientController {

    private IDictService service;

    /**
     * 获取字典表对应值
     *
     * @param code    字典编号
     * @param dictKey 字典序号
     * @return
     */
    @GetMapping("/getValue")
    public R<String> getValue(@RequestParam("code") String code, @RequestParam("dictKey") Integer dictKey) {
        return R.data(service.getValue(code, dictKey));
    }

    /**
     * 获取字典表
     *
     * @param code 字典编号
     * @return
     */
    @GetMapping("/getList")
    public R<List<Dict>> getList(@RequestParam("code") String code) {
        return R.data(service.getList(code));
    }

}
