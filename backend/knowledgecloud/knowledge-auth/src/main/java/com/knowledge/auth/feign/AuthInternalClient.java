package com.knowledge.auth.feign;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.dto.AuthSessionDTO;
import com.knowledge.system.dto.AuthSessionValidationDTO;
import com.knowledge.system.vo.UserInfo;

@FeignClient(
        value = AppConstant.APPLICATION_SYSTEM_NAME,
        contextId = "authIdentityInternalClient",
        configuration = AuthInternalFeignConfiguration.class)
public interface AuthInternalClient {

    @GetMapping("/user/user-info")
    R<UserInfo> passwordUserInfo(
            @RequestParam(value = "tenantId", required = false) String tenantId,
            @RequestParam("account") String account,
            @RequestParam("password") String password);

    @GetMapping("/user/user-info-by-context")
    R<UserInfo> userInfoByContext(@RequestParam("userId") Long userId,
            @RequestParam("contextId") String contextId);

    @PostMapping("/auth-session/internal/upsert")
    R<?> upsertSession(@RequestBody AuthSessionDTO dto);

    @PostMapping("/auth-session/internal/validate")
    R<Boolean> validateSession(@RequestBody AuthSessionValidationDTO dto);

    @PostMapping("/auth-session/internal/revoke")
    R<?> revokeSession(@RequestParam("sessionKey") String sessionKey);
}
