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
package com.knowledge.auth.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Auth module security configuration.
 * This configuration takes precedence over the default
 * KnowledgeSecurityConfiguration
 * to permit public access to authentication endpoints.
 *
 * @author Knowledge
 */
@Configuration
@EnableWebSecurity
public class AuthSecurityConfiguration {

    /**
     * Security filter chain for auth endpoints.
     * Uses @Order(1) to take precedence over the default security configuration.
     *
     * @param http HttpSecurity
     * @return SecurityFilterChain
     * @throws Exception if configuration fails
     */
    @Bean
    @Order(1)
    public SecurityFilterChain authSecurityFilterChain(HttpSecurity http) throws Exception {
        http
                // Match auth-related endpoints
                .requestMatchers(matchers -> matchers
                        .antMatchers(
                                "/oauth2/token",
                                "/oauth2/**",
                                "/token", // legacy endpoint
                                "/captcha",
                                "/oauth/render/**",
                                "/oauth/callback/**",
                                "/oauth/revoke/**",
                                "/oauth/refresh/**"))
                // Disable CSRF for auth endpoints (stateless API)
                .csrf().disable()
                // Configure session management as stateless
                .sessionManagement()
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                .and()
                // Configure authorization
                .authorizeRequests()
                // Permit all auth endpoints without authentication
                .antMatchers(
                        "/oauth2/token",
                        "/oauth2/**",
                        "/token",
                        "/captcha",
                        "/oauth/render/**",
                        "/oauth/callback/**",
                        "/oauth/revoke/**",
                        "/oauth/refresh/**")
                .permitAll()
                // Any other request under these matchers requires authentication
                .anyRequest().authenticated();

        return http.build();
    }
}
