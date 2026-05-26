package com.knowledge.system.feign;

import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.vo.RoleFO;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

@FeignClient(AppConstant.APPLICATION_SYSTEM_NAME)
public interface IRoleClient {

	String API_PREFIX = "/role";

	@GetMapping(API_PREFIX + "/client/roles")
	R<List<RoleFO>> clientRoles(@RequestParam("clientId") String clientId);

}
