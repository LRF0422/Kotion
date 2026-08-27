package com.knowledge.system.domain.dto;

import java.io.Serializable;
import java.util.List;

import lombok.Data;

/**
 * 管理后台用户创建/资料编辑请求。
 * 密码与角色仅在创建时使用，已有用户的角色通过独立授权接口修改。
 */
@Data
public class AdminUserSubmitDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String account;
    private String name;
    private String realName;
    private String email;
    private String phone;
    private String password;
    private List<Long> roleIds;
}
