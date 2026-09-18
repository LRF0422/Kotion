package com.knowledge.core.entitlement.client;

import com.knowledge.core.entitlement.model.EntitlementSnapshot;
import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.tool.api.R;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * 权益服务的内部 Feign 客户端。
 *
 * <p>由权益权威源（knowledge-system）作为 {@code @RestController} 实现；
 * 其他服务通过依赖本模块 + 平台 {@code @EnableFeignClients} 自动获得代理。</p>
 *
 * @author Kotion
 */
@FeignClient(value = AppConstant.APPLICATION_SYSTEM_NAME, contextId = "entitlementInternalClient",
		configuration = EntitlementFeignConfiguration.class)
public interface IEntitlementClient {

	String API_PREFIX = "/entitlement/internal";

	@GetMapping(API_PREFIX + "/snapshot")
	R<EntitlementSnapshot> snapshot(@RequestParam("userId") Long userId);

	@GetMapping(API_PREFIX + "/check")
	R<Boolean> hasFeature(@RequestParam("userId") Long userId, @RequestParam("code") String code);

	@GetMapping(API_PREFIX + "/quota")
	R<Long> getQuota(@RequestParam("userId") Long userId, @RequestParam("code") String code);
}
