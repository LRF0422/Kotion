package com.knowledge.agent.core.skill;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The agent's callback is a backend-initiated request; the target service's
 * JWT filter only accepts a {@code Bearer } prefix, while
 * {@code SecurityContextUtil.getToken()} hands back the bare token.
 */
class RemoteSkillInvokerTest {

    @Test
    void prefixesBareJwtWithBearer() {
        assertEquals("Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
                RemoteSkillInvoker.bearerToken("eyJhbGciOiJIUzI1NiJ9.payload.sig"));
    }

    @Test
    void leavesAlreadyPrefixedTokenUntouched() {
        assertEquals("Bearer abc.def.ghi", RemoteSkillInvoker.bearerToken("Bearer abc.def.ghi"));
        assertEquals("bearer abc.def.ghi", RemoteSkillInvoker.bearerToken("bearer abc.def.ghi"));
    }

    @Test
    void blankTokenBecomesEmptyHeader() {
        assertEquals("", RemoteSkillInvoker.bearerToken(null));
        assertEquals("", RemoteSkillInvoker.bearerToken("   "));
    }
}
