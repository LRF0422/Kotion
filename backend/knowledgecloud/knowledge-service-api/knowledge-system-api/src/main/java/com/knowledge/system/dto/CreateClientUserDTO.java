package com.knowledge.system.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class CreateClientUserDTO implements Serializable {

	private String account;
	private String realName;
	private String email;
	private String wechat;
	private String password;
	private String confirmPassword;
	private String name;
	private String avatar;
	private Long groupId;
}
