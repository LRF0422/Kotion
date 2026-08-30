package com.knowledge.core.cloud.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

import com.knowledge.core.secure.TokenInfo;
import com.knowledge.core.secure.provider.JwtTokenProvider;

class ServiceTokenProviderTest {

    @Test
    void refreshesServiceTokenUsingReturnedTokenValidity() {
        JwtTokenProvider jwtTokenProvider = mock(JwtTokenProvider.class);
        Clock clock = mock(Clock.class);
        AtomicLong nowMillis = new AtomicLong(1_000_000L);
        when(clock.millis()).thenAnswer(invocation -> nowMillis.get());
        when(jwtTokenProvider.createAccessToken(anyMap()))
                .thenReturn(token("token-1", 900), token("token-2", 900));

        ServiceTokenProvider provider = new ServiceTokenProvider(jwtTokenProvider, clock);

        assertEquals("token-1", provider.getServiceToken());

        nowMillis.addAndGet(599_000L);
        assertEquals("token-1", provider.getServiceToken());
        verify(jwtTokenProvider, times(1)).createAccessToken(anyMap());

        nowMillis.addAndGet(2_000L);
        assertEquals("token-2", provider.getServiceToken());
        verify(jwtTokenProvider, times(2)).createAccessToken(anyMap());
    }

    private TokenInfo token(String value, int expire) {
        TokenInfo token = new TokenInfo();
        token.setToken(value);
        token.setExpire(expire);
        return token;
    }
}
