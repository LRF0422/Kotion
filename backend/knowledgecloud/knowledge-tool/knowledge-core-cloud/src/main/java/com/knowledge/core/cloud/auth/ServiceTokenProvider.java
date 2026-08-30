/**
 * Copyright (c) 2018-2028, Chill Zhuang 庄骞 (smallchill@163.com).
 * <p>
 * Licensed under the GNU LESSER GENERAL PUBLIC LICENSE 3.0;
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * <p>
 * http://www.gnu.org/licenses/lgpl.html
 * <p>
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.knowledge.core.cloud.auth;

import com.knowledge.core.launch.constant.TokenConstant;
import com.knowledge.core.secure.TokenInfo;
import com.knowledge.core.secure.provider.JwtTokenProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Provider for service-to-service authentication tokens.
 * <p>
 * This component generates JWT tokens for internal service calls when there's
 * no
 * HTTP request context (e.g., during service startup, scheduled tasks,
 * event-driven processing).
 * The token is cached and automatically refreshed when close to expiration.
 * </p>
 *
 * @author Knowledge
 */
@Slf4j
@Component
public class ServiceTokenProvider {

    /**
     * Refresh token when less than 5 minutes remaining
     */
    private static final long REFRESH_THRESHOLD_MILLIS = 5 * 60 * 1000L;

    /**
     * Service account constants
     */
    private static final String SERVICE_ACCOUNT = "internal-service";
    private static final String SERVICE_USER_NAME = "Internal Service";
    private static final String SERVICE_ROLE_NAME = "service";
    private static final String SERVICE_TENANT_ID = "000000";
    private static final Long SERVICE_USER_ID = -1L;
    private static final String SERVICE_ROLE_ID = "-1";
    private static final String SERVICE_CLIENT_ID = "service";

    private final JwtTokenProvider jwtTokenProvider;
    private final Clock clock;

    /**
     * Cached token holder containing the token and its expiration time
     */
    private final AtomicReference<CachedToken> cachedTokenRef = new AtomicReference<>();

    @Autowired
    public ServiceTokenProvider(JwtTokenProvider jwtTokenProvider) {
        this(jwtTokenProvider, Clock.systemUTC());
    }

    ServiceTokenProvider(JwtTokenProvider jwtTokenProvider, Clock clock) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.clock = clock;
    }

    /**
     * Gets a service account JWT token for internal service-to-service calls.
     * The token is cached and automatically refreshed when close to expiration.
     *
     * @return a valid JWT token string
     */
    public String getServiceToken() {
        CachedToken cached = cachedTokenRef.get();

        // Check if we have a valid cached token that's not close to expiration
        if (cached != null && !isExpiringSoon(cached)) {
            return cached.token;
        }

        // Generate new token (thread-safe via atomic compare-and-set)
        return refreshToken();
    }

    /**
     * Checks if the cached token is expiring soon or already expired.
     *
     * @param cached the cached token to check
     * @return true if the token should be refreshed
     */
    private boolean isExpiringSoon(CachedToken cached) {
        long timeUntilExpiry = cached.expirationTimeMillis - clock.millis();
        return timeUntilExpiry < REFRESH_THRESHOLD_MILLIS;
    }

    /**
     * Generates a new service token and updates the cache.
     *
     * @return the new token string
     */
    private synchronized String refreshToken() {
        // Double-check after acquiring lock
        CachedToken cached = cachedTokenRef.get();
        if (cached != null && !isExpiringSoon(cached)) {
            return cached.token;
        }

        log.debug("Generating new service account token");

        Map<String, Object> claims = buildServiceClaims();
        long tokenGenerationStartMillis = clock.millis();
        TokenInfo tokenInfo = jwtTokenProvider.createAccessToken(claims);

        long expirationTimeMillis = tokenGenerationStartMillis
                + TimeUnit.SECONDS.toMillis(tokenInfo.getExpire());
        CachedToken newCached = new CachedToken(tokenInfo.getToken(), expirationTimeMillis);
        cachedTokenRef.set(newCached);

        log.debug("Service account token generated, expires in {} seconds", tokenInfo.getExpire());
        return newCached.token;
    }

    /**
     * Builds the claims for the service account token.
     *
     * @return map of claims
     */
    private Map<String, Object> buildServiceClaims() {
        Map<String, Object> claims = new HashMap<>();
        claims.put(TokenConstant.TOKEN_TYPE, TokenConstant.ACCESS_TOKEN);
        claims.put(TokenConstant.ACCOUNT, SERVICE_ACCOUNT);
        claims.put(TokenConstant.USER_NAME, SERVICE_USER_NAME);
        claims.put(TokenConstant.ROLE_NAME, SERVICE_ROLE_NAME);
        claims.put(TokenConstant.TENANT_ID, SERVICE_TENANT_ID);
        claims.put(TokenConstant.USER_ID, SERVICE_USER_ID);
        claims.put(TokenConstant.ROLE_ID, SERVICE_ROLE_ID);
        claims.put(TokenConstant.CLIENT_ID, SERVICE_CLIENT_ID);
        claims.put(TokenConstant.LICENSE, TokenConstant.LICENSE_NAME);
        return claims;
    }

    /**
     * Invalidates the cached token, forcing regeneration on next call.
     * Useful for testing or when token needs to be refreshed immediately.
     */
    public void invalidateToken() {
        cachedTokenRef.set(null);
        log.debug("Service account token cache invalidated");
    }

    /**
     * Internal holder for cached token and its expiration time.
     */
    private static class CachedToken {
        final String token;
        final long expirationTimeMillis;

        CachedToken(String token, long expirationTimeMillis) {
            this.token = token;
            this.expirationTimeMillis = expirationTimeMillis;
        }
    }
}
