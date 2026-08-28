package com.knowledge.system.service.impl;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.system.domain.AuthSession;
import com.knowledge.system.dto.AuthSessionDTO;
import com.knowledge.system.dto.AuthSessionValidationDTO;
import com.knowledge.system.mapper.AuthSessionMapper;
import com.knowledge.system.service.IAuthSessionService;

import cn.hutool.core.util.StrUtil;

@Service
public class AuthSessionServiceImpl extends ServiceImpl<AuthSessionMapper, AuthSession>
        implements IAuthSessionService {

    private static final int STATUS_ACTIVE = 1;
    private static final int STATUS_REVOKED = 2;
    private static final int STATUS_ROTATING = 3;
    private static final long ROTATION_LEASE_SECONDS = 30L;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void upsert(AuthSessionDTO dto) {
        AuthSession session = this.lambdaQuery()
                .eq(AuthSession::getSessionKey, dto.getSessionKey())
                .one();
        if (session == null) {
            session = new AuthSession();
            session.setSessionKey(dto.getSessionKey());
        } else if (Integer.valueOf(STATUS_REVOKED).equals(session.getStatus())) {
            throw new ServiceException("登录会话已撤销");
        }
        session.setUserId(dto.getUserId());
        session.setAudience(dto.getAudience());
        session.setContextType(dto.getContextType());
        session.setContextId(dto.getContextId());
        session.setRefreshTokenHash(dto.getRefreshTokenHash());
        session.setAuthVersion(dto.getAuthVersion());
        session.setIssuedAt(dto.getIssuedAt());
        session.setExpiresAt(dto.getExpiresAt());
        session.setLastSeenAt(dto.getLastSeenAt());
        session.setDeviceName(dto.getDeviceName());
        session.setRemoteIp(dto.getRemoteIp());
        session.setUserAgent(dto.getUserAgent());
        session.setRevokedAt(null);
        session.setStatus(STATUS_ACTIVE);
        this.saveOrUpdate(session);
    }

    /**
     * Atomically consumes the current refresh token. Exactly one concurrent
     * refresh can move ACTIVE -> ROTATING; AuthController writes the successor
     * hash and returns the session to ACTIVE only after token issuance succeeds.
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean validate(AuthSessionValidationDTO dto) {
        if (dto == null || StrUtil.isBlank(dto.getSessionKey()) || StrUtil.isBlank(dto.getRefreshTokenHash())) {
            return false;
        }
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        LocalDateTime staleBefore = now.minusSeconds(ROTATION_LEASE_SECONDS);
        return this.lambdaUpdate()
                .eq(AuthSession::getSessionKey, dto.getSessionKey())
                .and(status -> status
                        .eq(AuthSession::getStatus, STATUS_ACTIVE)
                        .or(stale -> stale
                                .eq(AuthSession::getStatus, STATUS_ROTATING)
                                .lt(AuthSession::getLastSeenAt, staleBefore)))
                .eq(AuthSession::getRefreshTokenHash, dto.getRefreshTokenHash())
                .eq(dto.getAuthVersion() != null, AuthSession::getAuthVersion, dto.getAuthVersion())
                .isNull(AuthSession::getRevokedAt)
                .gt(AuthSession::getExpiresAt, LocalDateTime.now(ZoneOffset.UTC))
                .set(AuthSession::getStatus, STATUS_ROTATING)
                .set(AuthSession::getLastSeenAt, LocalDateTime.now(ZoneOffset.UTC))
                .update();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void revoke(String sessionKey) {
        this.lambdaUpdate()
                .eq(AuthSession::getSessionKey, sessionKey)
                .set(AuthSession::getStatus, STATUS_REVOKED)
                .set(AuthSession::getRevokedAt, LocalDateTime.now(ZoneOffset.UTC))
                .update();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void revokeUserSessions(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return;
        }
        this.lambdaUpdate()
                .in(AuthSession::getUserId, userIds)
                .set(AuthSession::getStatus, STATUS_REVOKED)
                .set(AuthSession::getRevokedAt, LocalDateTime.now(ZoneOffset.UTC))
                .update();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void revokeUserContextSessions(Long userId, String contextId) {
        this.lambdaUpdate()
                .eq(AuthSession::getUserId, userId)
                .eq(AuthSession::getContextId, contextId)
                .set(AuthSession::getStatus, STATUS_REVOKED)
                .set(AuthSession::getRevokedAt, LocalDateTime.now(ZoneOffset.UTC))
                .update();
    }
}
