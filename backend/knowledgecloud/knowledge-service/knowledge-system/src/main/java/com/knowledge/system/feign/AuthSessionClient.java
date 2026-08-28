package com.knowledge.system.feign;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.tool.api.R;
import com.knowledge.system.dto.AuthSessionDTO;
import com.knowledge.system.dto.AuthSessionValidationDTO;
import com.knowledge.system.service.IAuthSessionService;

import lombok.AllArgsConstructor;

@RestController
@AllArgsConstructor
@RequestMapping("/auth-session/internal")
@PreAuthorize("hasRole('service') and principal.clientId == 'service'")
public class AuthSessionClient {

    private final IAuthSessionService authSessionService;

    @PostMapping("/upsert")
    public R<?> upsert(@RequestBody AuthSessionDTO dto) {
        authSessionService.upsert(dto);
        return R.success();
    }

    @PostMapping("/validate")
    public R<Boolean> validate(@RequestBody AuthSessionValidationDTO dto) {
        return R.data(authSessionService.validate(dto));
    }

    @PostMapping("/revoke")
    public R<?> revoke(@RequestParam("sessionKey") String sessionKey) {
        authSessionService.revoke(sessionKey);
        return R.success();
    }
}
