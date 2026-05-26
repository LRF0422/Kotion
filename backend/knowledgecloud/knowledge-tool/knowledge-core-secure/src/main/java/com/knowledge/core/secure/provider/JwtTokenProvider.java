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
package com.knowledge.core.secure.provider;

import com.knowledge.core.launch.constant.TokenConstant;
import com.knowledge.core.secure.TokenInfo;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.utils.Func;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSSigner;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.util.Calendar;
import java.util.Date;
import java.util.Map;

/**
 * Centralized JWT token provider for encoding and decoding JWT tokens.
 * Uses Nimbus JWT library (from spring-security-oauth2-jose dependency).
 *
 * @author Knowledge
 */
@Slf4j
@Component
public class JwtTokenProvider {

    /**
     * The JWT secret key, configurable via property with fallback to
     * TokenConstant.SIGN_KEY
     */
    @Value("${knowledge.security.jwt.secret-key:" + TokenConstant.SIGN_KEY + "}")
    private String secretKey;

    /**
     * Default access token validity in seconds (2 hours)
     */
    @Value("${knowledge.security.jwt.access-token-validity:7200}")
    private int accessTokenValidity;

    /**
     * Default refresh token validity in seconds (30 days)
     */
    @Value("${knowledge.security.jwt.refresh-token-validity:2592000}")
    private int refreshTokenValidity;

    private JwtDecoder jwtDecoder;
    private SecretKey signingKey;

    @PostConstruct
    public void init() {
        // Ensure the key is at least 256 bits (32 bytes) for HS256
        byte[] keyBytes = secretKey.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            // Pad the key to 32 bytes if necessary
            byte[] paddedKey = new byte[32];
            System.arraycopy(keyBytes, 0, paddedKey, 0, Math.min(keyBytes.length, 32));
            keyBytes = paddedKey;
        }

        this.signingKey = new SecretKeySpec(keyBytes, "HmacSHA256");
        this.jwtDecoder = NimbusJwtDecoder.withSecretKey(signingKey).build();
    }

    /**
     * Creates an access token with the given claims.
     *
     * @param claims the claims to include in the token
     * @return TokenInfo containing the token and expiration
     */
    public TokenInfo createAccessToken(Map<String, Object> claims) {
        return createToken(claims, accessTokenValidity);
    }

    /**
     * Creates a refresh token with the given claims.
     *
     * @param claims the claims to include in the token
     * @return TokenInfo containing the token and expiration
     */
    public TokenInfo createRefreshToken(Map<String, Object> claims) {
        return createToken(claims, refreshTokenValidity);
    }

    /**
     * Creates a token with custom expiration (legacy support for 3AM next day
     * expiration).
     *
     * @param claims the claims to include in the token
     * @return TokenInfo containing the token and expiration
     */
    public TokenInfo createTokenWithDefaultExpiration(Map<String, Object> claims) {
        int expireSeconds = (int) (getExpiration() / 1000);
        return createToken(claims, expireSeconds);
    }

    /**
     * Creates a JWT token with the specified claims and validity period.
     *
     * @param claims          the claims to include
     * @param validitySeconds token validity in seconds
     * @return TokenInfo containing the token and expiration
     */
    private TokenInfo createToken(Map<String, Object> claims, int validitySeconds) {
        try {
            Date now = new Date();
            Date expiration = new Date(now.getTime() + (validitySeconds * 1000L));

            JWTClaimsSet.Builder claimsBuilder = new JWTClaimsSet.Builder()
                    .issueTime(now)
                    .expirationTime(expiration)
                    .notBeforeTime(now);

            // Add custom claims
            for (Map.Entry<String, Object> entry : claims.entrySet()) {
                claimsBuilder.claim(entry.getKey(), entry.getValue());
            }

            JWTClaimsSet claimsSet = claimsBuilder.build();

            // Create the signed JWT
            JWSHeader header = new JWSHeader.Builder(JWSAlgorithm.HS256)
                    .type(new com.nimbusds.jose.JOSEObjectType("JWT"))
                    .build();

            SignedJWT signedJWT = new SignedJWT(header, claimsSet);
            JWSSigner signer = new MACSigner(signingKey);
            signedJWT.sign(signer);

            TokenInfo tokenInfo = new TokenInfo();
            tokenInfo.setToken(signedJWT.serialize());
            tokenInfo.setExpire(validitySeconds);

            return tokenInfo;
        } catch (JOSEException e) {
            log.error("Failed to create JWT token", e);
            throw new RuntimeException("Failed to create JWT token", e);
        }
    }

    /**
     * Parses and validates a JWT token, returning the claims.
     *
     * @param token the JWT token string
     * @return the parsed Jwt object, or null if invalid
     */
    public Jwt parseToken(String token) {
        try {
            return jwtDecoder.decode(token);
        } catch (JwtException e) {
            log.debug("Failed to parse JWT token: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Extracts a KnowledgeUser from a JWT token.
     *
     * @param token the JWT token string
     * @return KnowledgeUser extracted from claims, or null if invalid
     */
    public KnowledgeUser extractUser(String token) {
        Jwt jwt = parseToken(token);
        if (jwt == null) {
            return null;
        }
        return extractUserFromClaims(jwt.getClaims());
    }

    /**
     * Extracts a KnowledgeUser from JWT claims.
     *
     * @param claims the JWT claims
     * @return KnowledgeUser extracted from claims
     */
    public KnowledgeUser extractUserFromClaims(Map<String, Object> claims) {
        KnowledgeUser user = new KnowledgeUser();
        user.setClientId(Func.toStr(claims.get(TokenConstant.CLIENT_ID)));
        user.setUserId(Func.toLong(claims.get(TokenConstant.USER_ID)));
        user.setTenantId(Func.toStr(claims.get(TokenConstant.TENANT_ID)));
        user.setRoleId(Func.toStr(claims.get(TokenConstant.ROLE_ID)));
        user.setDeptId(Func.toStr(claims.get(TokenConstant.DEPT_ID)));
        user.setAccount(Func.toStr(claims.get(TokenConstant.ACCOUNT)));
        user.setRoleName(Func.toStr(claims.get(TokenConstant.ROLE_NAME)));
        user.setUserName(Func.toStr(claims.get(TokenConstant.USER_NAME)));
        user.setCurrentInstallAppId(Func.toLong(claims.get(TokenConstant.CURRENT_INSTALL_APP_ID)));

        // Handle oauth_id if present
        Object oauthId = claims.get(TokenConstant.OAUTH_ID);
        if (oauthId != null) {
            // oauth_id can be stored on user if needed in the future
        }

        return user;
    }

    /**
     * Gets the default expiration time (next day 3AM).
     * This maintains backward compatibility with the existing expiration logic.
     *
     * @return expiration time in milliseconds from now
     */
    public long getExpiration() {
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.DAY_OF_YEAR, 1);
        cal.set(Calendar.HOUR_OF_DAY, 3);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis() - System.currentTimeMillis();
    }

    /**
     * Validates a token without extracting claims.
     *
     * @param token the JWT token string
     * @return true if valid, false otherwise
     */
    public boolean validateToken(String token) {
        return parseToken(token) != null;
    }

    /**
     * Gets the configured secret key.
     * Package-private for testing purposes.
     *
     * @return the secret key
     */
    String getSecretKey() {
        return secretKey;
    }

    /**
     * Gets the access token validity in seconds.
     *
     * @return access token validity
     */
    public int getAccessTokenValidity() {
        return accessTokenValidity;
    }

    /**
     * Gets the refresh token validity in seconds.
     *
     * @return refresh token validity
     */
    public int getRefreshTokenValidity() {
        return refreshTokenValidity;
    }
}
