package com.knowledge.system.service;

import java.util.List;

import com.baomidou.mybatisplus.extension.service.IService;
import com.knowledge.system.domain.AuthSession;
import com.knowledge.system.dto.AuthSessionDTO;
import com.knowledge.system.dto.AuthSessionValidationDTO;

public interface IAuthSessionService extends IService<AuthSession> {

    void upsert(AuthSessionDTO dto);

    boolean validate(AuthSessionValidationDTO dto);

    void revoke(String sessionKey);

    void revokeUserSessions(List<Long> userIds);

    void revokeUserContextSessions(Long userId, String contextId);
}
