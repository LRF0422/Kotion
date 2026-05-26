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

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.tool.node.ForestNodeMerger;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.core.tool.utils.StringPool;
import com.knowledge.system.entity.Dict;
import com.knowledge.system.mapper.DictMapper;
import com.knowledge.system.service.IDictService;
import com.knowledge.system.vo.DictVO;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

import static com.knowledge.common.cache.CacheNames.DICT_LIST;
import static com.knowledge.common.cache.CacheNames.DICT_VALUE;

/**
 * 服务实现类
 *
 * @author Chill
 */
@Service
public class DictServiceImpl extends ServiceImpl<DictMapper, Dict> implements IDictService {

    @Override
    public IPage<DictVO> selectDictPage(IPage<DictVO> page, DictVO dict) {
        return page.setRecords(baseMapper.selectDictPage(page, dict));
    }

    @Override
    @Cacheable(value = DICT_LIST, key = "#code")
    public List<DictVO> tree(String code) {
        List<DictVO> list = baseMapper.tree();
        if (Func.isNotEmpty(code)) {
            list = list.stream().filter(
                    dictVO -> Func.equals(dictVO.getCode(), code)).collect(Collectors.toList());
        }
        return ForestNodeMerger.merge(list);
    }

    @Override
    @Cacheable(value = DICT_VALUE, key = "#code + '_' + #dictKey")
    public String getValue(String code, Integer dictKey) {
        return Func.toStr(baseMapper.getValue(code, dictKey), StringPool.EMPTY);
    }

    @Override
    @Cacheable(value = DICT_LIST, key = "#code")
    public List<Dict> getList(String code) {
        return baseMapper.getList(code);
    }

    @Override
    @CacheEvict(value = { DICT_LIST, DICT_VALUE }, allEntries = true)
    public boolean submit(Dict dict) {
        Long count = baseMapper.selectCount(
                Wrappers.<Dict>query().lambda()
                        .eq(Dict::getCode, dict.getCode())
                        .eq(Dict::getDictKey, dict.getDictKey()));
        if (count > 0 && Func.isEmpty(dict.getId())) {
            throw new ServiceException("当前字典码和字典值已存在!");
        }
        return saveOrUpdate(dict);
    }

    @Override
    @CacheEvict(value = { DICT_LIST, DICT_VALUE }, allEntries = true)
    public boolean removeByIds(Collection<?> idList) {
        return super.removeByIds(idList);
    }

}
