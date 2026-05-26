package com.knowledge.core.permission.feign;

import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.permission.core.model.AbstractResource;
import com.knowledge.core.tool.api.R;

import java.util.List;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(AppConstant.APPLICATION_SYSTEM_NAME)
public interface IPermissionClient {

	String API_PREFIX = "/permission";

	@GetMapping(API_PREFIX + "/hasPermission")
	R<Boolean> hasPermission(
			@RequestParam("sub") String sub,
			@RequestParam("obj") String obj,
			@RequestParam(value = "action", required = false, defaultValue = "*") String action);

	@PostMapping(API_PREFIX + "/resources")
	R<?> saveOrUpdateResources(@RequestBody List<? extends AbstractResource> resources);

}
