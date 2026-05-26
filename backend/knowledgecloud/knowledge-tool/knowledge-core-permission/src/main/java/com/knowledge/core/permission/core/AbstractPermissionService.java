package com.knowledge.core.permission.core;

import com.knowledge.core.permission.feign.IPermissionClient;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.utils.ApiClientUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;

@Slf4j
public abstract class AbstractPermissionService {

	@Autowired
	protected IPermissionClient permissionClient;

	protected boolean hasPermission(String resourceName) {
		return ApiClientUtil
				.resolvingResponse(
						permissionClient.hasPermission(SecurityContextUtil.getUserId() + "", resourceName, "*"));
	}

	protected boolean hasPermission(String[] resourceNames) {
		// return EnforcerFactory.hasPermission(SecurityContextUtil.getUserId() +
		// "",resourceNames);
		return false;
	}

}
