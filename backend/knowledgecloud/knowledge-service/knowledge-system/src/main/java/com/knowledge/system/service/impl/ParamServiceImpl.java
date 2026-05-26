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
package com.knowledge.system.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.common.base.BaseService;
import com.knowledge.core.common.base.IConverter;
import com.knowledge.system.domain.Param;
import com.knowledge.system.mapper.ParamMapper;
import com.knowledge.system.service.IParamService;
import com.knowledge.system.vo.ParamVO;
import org.springframework.stereotype.Service;

/**
 * 服务实现类
 *
 * @author Chill
 */
@Service
public class ParamServiceImpl extends BaseService<ParamMapper, Param> implements IParamService {

	@Override
	public IPage<ParamVO> selectParamPage(IPage<ParamVO> page, ParamVO param) {
		return page.setRecords(baseMapper.selectParamPage(page, param));
	}

	@Override
	public String getParamValue(String paramKey) {
		return this.lambdaQuery()
				.eq(Param::getParamKey, paramKey)
				.oneOpt().map(Param::getParamValue)
				.orElse("");
	}

}
