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

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

import io.swagger.annotations.ApiModel;
import lombok.Data;

import java.io.Serializable;
import java.util.Date;

/**
 * 视图实体类
 *
 * @author Chill
 */
@Data
@ApiModel(value = "UserVO对象", description = "UserVO对象")
public class UserVO implements Serializable {
	private static final long serialVersionUID = 1L;
	/**
	 * 主键id
	 */
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * 编号
	 */
	private String code;
	/**
	 * 账号
	 */
	private String account;

	/**
	 * 昵称
	 */
	private String name;
	/**
	 * 真名U
	 */
	private String realName;
	/**
	 * 头像
	 */
	private String avatar;
	/**
	 * 邮箱
	 */
	private String email;
	/**
	 * 手机
	 */
	private String phone;
	/**
	 * 生日
	 */
	private Date birthday;
	/**
	 * 性别
	 */
	private Integer sex;
	/**
	 * 角色id
	 */
	private String roleId;
	/**
	 * 部门id
	 */
	private String deptId;
	/**
	 * 部门id
	 */
	private String postId;
	private String roleName;
	private String roleAlias;
	private String deptName;
	private String sexName;

	private String tenantId;

	private Boolean isSetup;

	/**
	 * 账号状态（1-正常 2-禁用）
	 */
	private Integer status;
}
