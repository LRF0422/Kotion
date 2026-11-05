package com.knowledge.wiki.service.collab;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import com.knowledge.wiki.service.collab.CollabSessionService.PageSession;
import com.knowledge.wiki.service.collab.CollabSessionService.SessionState;

import cn.hutool.json.JSONUtil;

/**
 * Arbitration rules of the single-writer lease, especially the guest lease an
 * invited collaborator can hold and the preemption that returns it to a regular
 * participant. The Redis client is mocked: what matters here is the decision
 * tree, not Redis itself.
 */
@ExtendWith(MockitoExtension.class)
class CollabSessionServiceTest {

    private static final Long PAGE_ID = 20L;
    private static final String KEY = "wiki:page:session:20";

    @Mock
    private RedisTemplate<String, String> redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @InjectMocks
    private CollabSessionService service;

    @BeforeEach
    void exposeValueOperations() {
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOperations);
    }

    @Test
    void emptySessionIsGrantedToARegularParticipant() {
        when(valueOperations.setIfAbsent(eq(KEY), anyString(), any(Duration.class))).thenReturn(true);

        SessionState state = service.claimSession(PAGE_ID, 7L, "host-client", "Host");

        assertEquals(CollabSessionService.ROLE_HOST, state.getRole());
        assertTrue(state.isAlive());
        assertTrue(state.isHostSelf());
        assertFalse(persistedClaim().isGuest());
    }

    /**
     * R2: an invited collaborator opening the page when nobody on the owner's side
     * is online holds the lease itself, which is what lets it save.
     */
    @Test
    void emptySessionIsGrantedToAGuestAndIsMarkedAsSuch() {
        when(valueOperations.setIfAbsent(eq(KEY), anyString(), any(Duration.class))).thenReturn(true);

        SessionState state = service.claimSession(PAGE_ID, 42L, "guest-client", "Guest", true);

        assertEquals(CollabSessionService.ROLE_HOST, state.getRole());
        assertTrue(state.isHostSelf());
        assertTrue(persistedClaim().isGuest());
    }

    /**
     * R3: the inviter (a regular participant) joining hands the write lease back
     * to the owner's side; the guest will learn it was demoted on its heartbeat.
     */
    @Test
    void regularClaimPreemptsAGuestHeldLease() {
        when(valueOperations.setIfAbsent(eq(KEY), anyString(), any(Duration.class))).thenReturn(false);
        when(valueOperations.get(KEY)).thenReturn(sessionJson(42L, "guest-client", "Guest", true));

        SessionState state = service.claimSession(PAGE_ID, 7L, "host-client", "Host");

        assertEquals(CollabSessionService.ROLE_HOST, state.getRole());
        assertTrue(state.isHostSelf());
        PageSession persisted = persistedTakeover();
        assertFalse(persisted.isGuest());
        assertEquals(Long.valueOf(7L), persisted.getHostUserId());
        assertEquals("host-client", persisted.getHostClientId());
    }

    @Test
    void guestClaimCannotDisplaceARegularHost() {
        when(valueOperations.setIfAbsent(eq(KEY), anyString(), any(Duration.class))).thenReturn(false);
        when(valueOperations.get(KEY)).thenReturn(sessionJson(7L, "host-client", "Host", false));

        SessionState state = service.claimSession(PAGE_ID, 42L, "guest-client", "Guest", true);

        assertEquals(CollabSessionService.ROLE_COLLABORATOR, state.getRole());
        assertEquals(Long.valueOf(7L), state.getHostUserId());
        assertFalse(state.isHostSelf());
        verify(valueOperations, never()).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void guestsDoNotArbitrateAmongThemselves() {
        when(valueOperations.setIfAbsent(eq(KEY), anyString(), any(Duration.class))).thenReturn(false);
        when(valueOperations.get(KEY)).thenReturn(sessionJson(42L, "other-guest", "Other guest", true));

        SessionState state = service.claimSession(PAGE_ID, 43L, "guest-client", "Guest", true);

        assertEquals(CollabSessionService.ROLE_COLLABORATOR, state.getRole());
        assertEquals(Long.valueOf(42L), state.getHostUserId());
        verify(valueOperations, never()).set(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void sameUserFromANewClientTakesOverItsOwnLease() {
        when(valueOperations.setIfAbsent(eq(KEY), anyString(), any(Duration.class))).thenReturn(false);
        when(valueOperations.get(KEY)).thenReturn(sessionJson(7L, "old-client", "Host", false));

        SessionState state = service.claimSession(PAGE_ID, 7L, "new-client", "Host");

        assertEquals(CollabSessionService.ROLE_HOST, state.getRole());
        assertTrue(state.isHostSelf());
        assertFalse(persistedTakeover().isGuest());
    }

    @Test
    void sameUserTakeoverThroughAnInvitationKeepsTheGuestKind() {
        when(valueOperations.setIfAbsent(eq(KEY), anyString(), any(Duration.class))).thenReturn(false);
        when(valueOperations.get(KEY)).thenReturn(sessionJson(42L, "old-client", "Guest", true));

        SessionState state = service.claimSession(PAGE_ID, 42L, "new-client", "Guest", true);

        assertEquals(CollabSessionService.ROLE_HOST, state.getRole());
        assertTrue(persistedTakeover().isGuest());
    }

    @Test
    void sameClientRenewalKeepsWhoeverHoldsTheLease() {
        when(valueOperations.setIfAbsent(eq(KEY), anyString(), any(Duration.class))).thenReturn(false);
        when(valueOperations.get(KEY)).thenReturn(sessionJson(42L, "guest-client", "Guest", true));

        SessionState state = service.claimSession(PAGE_ID, 42L, "guest-client", "Guest", true);

        assertEquals(CollabSessionService.ROLE_HOST, state.getRole());
        verify(redisTemplate).expire(eq(KEY), any(Duration.class));
        verify(valueOperations, never()).set(anyString(), anyString(), any(Duration.class));
    }

    /** An unreadable/expired session between SETNX and read is re-claimed. */
    @Test
    void expiredSessionIsReclaimed() {
        when(valueOperations.setIfAbsent(eq(KEY), anyString(), any(Duration.class))).thenReturn(false, true);
        when(valueOperations.get(KEY)).thenReturn(null);

        SessionState state = service.claimSession(PAGE_ID, 7L, "host-client", "Host");

        assertEquals(CollabSessionService.ROLE_HOST, state.getRole());
    }

    private PageSession persistedClaim() {
        ArgumentCaptor<String> json = ArgumentCaptor.forClass(String.class);
        verify(valueOperations).setIfAbsent(eq(KEY), json.capture(), any(Duration.class));
        return JSONUtil.toBean(json.getValue(), PageSession.class);
    }

    private PageSession persistedTakeover() {
        ArgumentCaptor<String> json = ArgumentCaptor.forClass(String.class);
        verify(valueOperations).set(eq(KEY), json.capture(), any(Duration.class));
        return JSONUtil.toBean(json.getValue(), PageSession.class);
    }

    private String sessionJson(Long userId, String clientId, String name, boolean guest) {
        PageSession session = new PageSession();
        session.setHostUserId(userId);
        session.setHostClientId(clientId);
        session.setHostName(name);
        session.setGuest(guest);
        session.setStartedAt(System.currentTimeMillis());
        return JSONUtil.toJsonStr(session);
    }
}
