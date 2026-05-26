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
package com.knowledge.system.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;
import java.io.Serializable;

/**
 * 岗位表视图实体类
 *
 * @author Chill
 */
@Data
@ApiModel(value = "PostVO对象", description = "岗位表")
public class PostVO implements Serializable {
	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "主键")
	private Long id;

	/**
	 * 类型
	 */
	@ApiModelProperty(value = "类型")
	private Integer category;
	/**
	 * 岗位编号
	 */
	@ApiModelProperty(value = "岗位编号")
	private String postCode;
	/**
	 * 岗位名称
	 */
	@ApiModelProperty(value = "岗位名称")
	private String postName;
	/**
	 * 岗位排序
	 */
	@ApiModelProperty(value = "岗位排序")
	private Integer sort;
	/**
	 * 岗位描述
	 */
	@ApiModelProperty(value = "岗位描述")
	private String remark;

	/**
	 * 岗位分类名
	 */
	private String categoryName;

}
