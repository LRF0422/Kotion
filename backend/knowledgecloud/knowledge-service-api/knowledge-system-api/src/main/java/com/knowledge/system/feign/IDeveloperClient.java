package com.knowledge.system.feign;

import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.vo.DeveloperVerificationVO;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 开发者认证 Feign 接口。
 *
 * <p>knowledge-wiki 在提交插件 / 发布版本前调用，当前用户从透传的
 * Authorization 解析，不需要额外参数。
 */
@FeignClient(AppConstant.APPLICATION_SYSTEM_NAME)
public interface IDeveloperClient {

    String API_PREFIX = "/developer";

    @GetMapping(API_PREFIX + "/verification")
    R<DeveloperVerificationVO> verification();
}
