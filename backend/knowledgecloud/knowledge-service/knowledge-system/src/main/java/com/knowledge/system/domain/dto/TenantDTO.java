package com.knowledge.system.domain.dto;

import lombok.Data;

import java.io.Serializable;

import com.knowledge.system.domain.enums.TenantType;

@Data
public class TenantDTO implements Serializable {

	private String tenantName;
	private String domainName;
	private TenantType tenantType;
	private String nickName;
	private String account;
	private String password;
	private String confirmPassword;
	private String avatar;

}
