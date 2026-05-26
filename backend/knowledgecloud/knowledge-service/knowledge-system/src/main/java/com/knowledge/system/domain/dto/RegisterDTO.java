package com.knowledge.system.domain.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class RegisterDTO implements Serializable {

	private String email;
	private String account;
	private String password;
	private String avatar;
	private String tenantId;
	private String name;

}
