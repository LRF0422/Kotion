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
package com.knowledge.core.secure.filter;

import com.knowledge.core.launch.constant.TokenConstant;
import com.knowledge.core.secure.auth.KnowledgeUserAuthentication;
import com.knowledge.core.secure.provider.JwtTokenProvider;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.utils.StringUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * JWT Authentication Filter that extracts and validates JWT tokens from
 * requests.
 * This filter runs once per request and sets up the Spring Security context.
 * 
 * Supports both standard Authorization header and legacy knowledge-auth header
 * for backward compatibility during the transition period.
 *
 * @author Knowledge
 */
@Slf4j
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    /**
     * Standard HTTP Authorization header
     */
    private static final String AUTHORIZATION_HEADER = "Authorization";

    /**
     * Legacy knowledge-auth header for backward compatibility
     */
    private static final String LEGACY_HEADER = TokenConstant.HEADER;

    /**
     * Bearer token prefix
     */
    private static final String BEARER_PREFIX = "Bearer ";

    /**
     * Legacy bearer prefix (lowercase)
     */
    private static final String BEARER_PREFIX_LOWER = "bearer ";

    /**
     * Minimum auth header length to contain "Bearer " + token
     */
    private static final int MIN_AUTH_LENGTH = 7;

    private final JwtTokenProvider jwtTokenProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        try {
            String token = extractToken(request);

            if (StringUtil.isNotBlank(token)) {
                KnowledgeUser user = jwtTokenProvider.extractUser(token);

                if (user != null && user.getUserId() != null) {
                    // Create and set authentication
                    KnowledgeUserAuthentication authentication = new KnowledgeUserAuthentication(user, token);
                    SecurityContextHolder.getContext().setAuthentication(authentication);

                    // Store user in request attribute for backward compatibility
                    request.setAttribute("_knowledge_USER_REQUEST_ATTR_", user);

                    log.debug("Set security context for user: {}", user.getAccount());
                }
            }
        } catch (Exception e) {
            log.debug("Could not set user authentication in security context: {}", e.getMessage());
            // Don't block the request - let Spring Security authorization decide
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Extracts the JWT token from the request.
     * Checks both the standard Authorization header and the legacy knowledge-auth
     * header.
     *
     * @param request the HTTP request
     * @return the JWT token string, or null if not found
     */
    private String extractToken(HttpServletRequest request) {
        // Try standard Authorization header first
        String token = extractTokenFromHeader(request, AUTHORIZATION_HEADER);

        // Fall back to legacy knowledge-auth header
        if (token == null) {
            token = extractTokenFromHeader(request, LEGACY_HEADER);
        }

        // Fall back to request parameter (for WebSocket or special cases)
        if (token == null) {
            String paramToken = request.getParameter(LEGACY_HEADER);
            if (StringUtil.isNotBlank(paramToken)) {
                token = paramToken;
            }
        }

        return token;
    }

    /**
     * Extracts the token from a specific header.
     *
     * @param request    the HTTP request
     * @param headerName the header name
     * @return the token, or null if not found
     */
    private String extractTokenFromHeader(HttpServletRequest request, String headerName) {
        String authHeader = request.getHeader(headerName);

        if (StringUtil.isBlank(authHeader) || authHeader.length() <= MIN_AUTH_LENGTH) {
            return null;
        }

        // Check for "Bearer " prefix (case-insensitive for the legacy header)
        if (authHeader.startsWith(BEARER_PREFIX)) {
            return authHeader.substring(BEARER_PREFIX.length());
        }

        // Legacy header uses lowercase "bearer"
        String headerLower = authHeader.substring(0, Math.min(7, authHeader.length())).toLowerCase();
        if (headerLower.startsWith(BEARER_PREFIX_LOWER.substring(0, Math.min(6, BEARER_PREFIX_LOWER.length())))) {
            return authHeader.substring(MIN_AUTH_LENGTH);
        }

        return null;
    }

    /**
     * Determines if this filter should NOT be applied to a request.
     * Returns false to ensure the filter runs for all requests.
     *
     * @param request the HTTP request
     * @return false (filter should run for all requests)
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return false;
    }
}
