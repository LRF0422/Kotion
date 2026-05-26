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
package com.knowledge.system.wrapper;

import com.knowledge.core.mp.support.BaseEntityWrapper;
import com.knowledge.core.tool.node.ForestNodeMerger;
import com.knowledge.core.tool.node.INode;
import com.knowledge.core.tool.utils.BeanUtil;
import com.knowledge.system.entity.Dict;
import com.knowledge.system.vo.DictVO;

import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * 字典包装类,返回视图层所需的字段
 *
 * @author Chill
 */
public class DictWrapper extends BaseEntityWrapper<Dict, DictVO> {

    public static DictWrapper build() {
        return new DictWrapper();
    }

    @Override
    public DictVO entityVO(Dict dict) {
        DictVO dictVO = Objects.requireNonNull(BeanUtil.copy(dict, DictVO.class));
        return dictVO;
    }

    /**
     * 构建树形节点
     *
     * @param list
     * @return
     */
    public List<DictVO> listNodeVO(List<Dict> list) {
        List<DictVO> collect = list.stream().map(dict -> BeanUtil.copy(dict, DictVO.class))
                .collect(Collectors.toList());
        return ForestNodeMerger.merge(collect);
    }

    /**
     * 构建树形节点(懒加载)
     *
     * @param list
     * @return
     */
    public List<DictVO> listNodeLazyVO(List<DictVO> list) {
        return ForestNodeMerger.merge(list);
    }

}
