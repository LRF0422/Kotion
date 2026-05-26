package com.knowledge.system.domain.dto;

import java.io.Serializable;

import lombok.Data;

@Data
public class UserSetupDTO implements Serializable {

    private String account;
    private String avatar;
    private String password;
    private String nickName;
    private String realName;

}
