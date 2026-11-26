package com.knowledge.agent.core.web;

import com.knowledge.agent.core.state.AgentStateException;
import com.knowledge.core.secure.utils.SecurityContextUtil;

/** Owner identity for the runtime-state endpoints (reads JWT, never trusts body ids). */
final class AgentStateIdentity {

    private AgentStateIdentity() {
    }

    static Identity require() {
        Long userId = SecurityContextUtil.getUserId();
        Long tenantId = parseTenantId();
        if (userId == null || userId.longValue() <= 0 || tenantId == null) {
            throw new AgentStateException("IDENTITY_REQUIRED",
                    "authentication is required to access agent runtime state");
        }
        return new Identity(tenantId, userId);
    }

    private static Long parseTenantId() {
        try {
            String tenantId = SecurityContextUtil.getTenantId();
            if (tenantId == null || tenantId.trim().isEmpty()) {
                return null;
            }
            return Long.valueOf(tenantId.trim());
        } catch (Exception e) {
            return null;
        }
    }

    static final class Identity {
        final Long tenantId;
        final Long userId;

        private Identity(Long tenantId, Long userId) {
            this.tenantId = tenantId;
            this.userId = userId;
        }
    }
}