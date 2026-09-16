package com.knowledge.wiki.feign;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.tool.api.R;

/**
 * 组织（上下文）成员内部接口。
 *
 * <p>页面协作邀请被接受时，接受方往往与共享空间不在同一个上下文（租户）。普通读写
 * 都带上下文条件，因此必须先让受邀人成为该上下文的有效成员，之后客户端才能切换上下文
 * 并打开共享页面。
 *
 * <p>该接口在 knowledge-system 侧通过自定义请求头
 * {@link OrganizationMembershipFeignConfiguration#INTERNAL_TOKEN_HEADER} 校验内部
 * 服务身份（见 {@link OrganizationMembershipFeignConfiguration}）。
 */
@FeignClient(
		value = AppConstant.APPLICATION_SYSTEM_NAME,
		contextId = "organizationMembershipClient",
		configuration = OrganizationMembershipFeignConfiguration.class)
public interface IOrganizationMembershipClient {

	String API_PREFIX = "/organization-membership/internal";

	/**
	 * 幂等地保证用户是目标上下文的有效成员（外部协作者以 ORG_GUEST 身份加入）。
	 *
	 * @param userId    用户id
	 * @param contextId 目标上下文（租户）id
	 * @return 是否已是/已成为有效成员
	 */
	@PostMapping(API_PREFIX + "/ensure-member")
	R<Boolean> ensureMember(@RequestParam("userId") Long userId,
			@RequestParam("contextId") String contextId);
}
