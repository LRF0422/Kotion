/**
 * Copyright (c) 2018-2028, Chill Zhuang 庄骞 (smallchill@163.com).
 * <p>
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * <p>
 * http://www.apache.org/licenses/LICENSE-2.0
 * <p>
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.knowledge.gateway.config;

import com.knowledge.core.launch.constant.TokenConstant;
import com.knowledge.gateway.handler.GatewayAuthenticationEntryPoint;
import com.knowledge.gateway.props.AuthProperties;
import com.knowledge.gateway.provider.AuthProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.security.web.server.SecurityWebFilterChain;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Reactive Spring Security configuration for the gateway.
 * Replaces the custom AuthFilter with Spring Security's JWT-based
 * authentication.
 *
 * @author Knowledge
 */
@Configuration
@EnableWebFluxSecurity
@RequiredArgsConstructor
public class GatewaySecurityConfiguration {

    private final AuthProperties authProperties;
    private final GatewayAuthenticationEntryPoint authenticationEntryPoint;

    /**
     * JWT secret key, configurable via property with fallback to
     * TokenConstant.SIGN_KEY
     */
    @Value("${knowledge.security.jwt.secret-key:" + TokenConstant.SIGN_KEY + "}")
    private String secretKey;

    /**
     * Configures the reactive security filter chain for the gateway.
     * - CSRF disabled (API gateway, stateless)
     * - Skip paths are permitted without authentication
     * - All other exchanges require JWT authentication
     * - Custom entry point for consistent 401 responses
     *
     * @param http the ServerHttpSecurity to configure
     * @return the configured SecurityWebFilterChain
     */
    @Bean
    public SecurityWebFilterChain springSecurityFilterChain(ServerHttpSecurity http) {
        // Collect all skip paths
        List<String> skipPaths = getAllSkipPaths();
        String[] skipPathsArray = skipPaths.toArray(new String[0]);

        http
                .csrf(ServerHttpSecurity.CsrfSpec::disable)
                .authorizeExchange(exchanges -> exchanges
                        .pathMatchers(skipPathsArray).permitAll()
                        .anyExchange().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt.jwtDecoder(reactiveJwtDecoder()))
                        .authenticationEntryPoint(authenticationEntryPoint))
                .exceptionHandling(exceptionHandling -> exceptionHandling
                        .authenticationEntryPoint(authenticationEntryPoint));

        return http.build();
    }

    /**
     * Creates a reactive JWT decoder using the same HS256 secret key as
     * JwtTokenProvider.
     *
     * @return the configured ReactiveJwtDecoder
     */
    @Bean
    public ReactiveJwtDecoder reactiveJwtDecoder() {
        // Ensure the key is at least 256 bits (32 bytes) for HS256
        byte[] keyBytes = secretKey.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            // Pad the key to 32 bytes if necessary
            byte[] paddedKey = new byte[32];
            System.arraycopy(keyBytes, 0, paddedKey, 0, Math.min(keyBytes.length, 32));
            keyBytes = paddedKey;
        }

        SecretKey key = new SecretKeySpec(keyBytes, "HmacSHA256");
        return NimbusReactiveJwtDecoder.withSecretKey(key)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
    }

    /**
     * Collects all skip paths from default configuration and external properties.
     * Also adds service-prefixed versions of all paths to handle gateway routing
     * where the service prefix (e.g., /knowledge-auth/) is present when Spring
     * Security
     * evaluates paths BEFORE the route filter strips the prefix.
     *
     * @return combined list of paths that should skip authentication
     */
    private List<String> getAllSkipPaths() {
        List<String> skipPaths = new ArrayList<>();

        // Add default skip URLs from AuthProvider
        skipPaths.addAll(AuthProvider.getDefaultSkipUrl());

        // Add externally configured skip URLs from AuthProperties
        skipPaths.addAll(authProperties.getSkipUrl());

        // Create combined list with both original and service-prefixed versions
        List<String> allSkipPaths = new ArrayList<>(skipPaths);

        // Add service-prefixed versions for gateway routing
        // When requests come through gateway routes like /knowledge-auth/oauth2/token,
        // Spring Security evaluates the path BEFORE the route filter strips the service
        // prefix.
        // Adding /* prefix handles any service prefix (e.g., /knowledge-auth/oauth2/**
        // matches /**/oauth2/**)
        for (String path : skipPaths) {
            if (path.startsWith("/")) {
                // Use single * for the service prefix segment (** can only be at the end)
                allSkipPaths.add("/*" + path);
            }
        }

        return allSkipPaths;
    }
}
