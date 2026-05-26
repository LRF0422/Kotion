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
package com.knowledge.core.secure.config;

import com.knowledge.core.secure.filter.JwtAuthenticationFilter;
import com.knowledge.core.secure.props.KnowledgeSecureProperties;
import com.knowledge.core.secure.provider.JwtTokenProvider;
import com.knowledge.core.secure.registry.SecureRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.util.ArrayList;
import java.util.List;

/**
 * Spring Security configuration for Knowledge platform.
 * This replaces the legacy SecureInterceptor-based security with Spring
 * Security filters.
 *
 * @author Knowledge
 */
@Order(99)
@AutoConfiguration
@EnableWebSecurity
@EnableGlobalMethodSecurity(prePostEnabled = true)
@EnableConfigurationProperties({ KnowledgeSecureProperties.class })
@RequiredArgsConstructor
public class KnowledgeSecurityConfiguration {

    private final SecureRegistry secureRegistry;
    private final KnowledgeSecureProperties secureProperties;
    private final JwtTokenProvider jwtTokenProvider;

    /**
     * Default excluded paths for public access.
     * Note: Spring Security's PathPatternParser does not allow ** in the middle of
     * patterns.
     * Use /public/** and /
     */
    public/**
           * to match public paths at root and one level deep.
           */
    static final String[] DEFAULT_EXCLUDED_PATHS = new String[] {
            "/actuator/health/**",
            "/v2/api-docs/**",
            "/auth/**",
            "/token/**",
            "/oauth2/**",
            "/log/**",
            "/user/user-info",
            "/user/user-info-by-id",
            "/menu/auth-routes",
            "/sys/meta",
            "/error/**",
            "/assets/**",
            "/public/**",
            "/*/public/**"
    };

    /**
     * Configures the Spring Security filter chain.
     *
     * @param http the HttpSecurity to configure
     * @return the configured SecurityFilterChain
     * @throws Exception if configuration fails
     */
    @Bean
    @ConditionalOnMissingBean(SecurityFilterChain.class)
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        // Disable CSRF for stateless API
        http.csrf().disable();

        // Configure session management as stateless
        http.sessionManagement()
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS);

        // Disable form login and http basic
        http.formLogin().disable();
        http.httpBasic().disable();

        // Configure authorization
        String[] excludedPaths = getExcludedPaths();

        if (secureRegistry.isEnabled()) {
            http.authorizeRequests()
                    .antMatchers(excludedPaths).permitAll()
                    .anyRequest().authenticated();
        } else {
            // If security is disabled, permit all requests
            http.authorizeRequests()
                    .anyRequest().permitAll();
        }

        // Add JWT authentication filter
        http.addFilterBefore(jwtAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class);

        // Disable X-Frame-Options for embedding
        http.headers().frameOptions().disable();

        return http.build();
    }

    /**
     * Creates the JWT authentication filter bean.
     *
     * @return the JwtAuthenticationFilter
     */
    @Bean
    public JwtAuthenticationFilter jwtAuthenticationFilter() {
        return new JwtAuthenticationFilter(jwtTokenProvider);
    }

    /**
     * Gets all excluded paths combining default, registry, and property-configured
     * paths.
     *
     * @return array of excluded path patterns
     */
    private String[] getExcludedPaths() {
        List<String> allPaths = new ArrayList<>();

        // Add default paths
        for (String path : DEFAULT_EXCLUDED_PATHS) {
            allPaths.add(path);
        }

        // Add registry default excluded patterns
        if (secureRegistry.getDefaultExcludePatterns() != null) {
            allPaths.addAll(secureRegistry.getDefaultExcludePatterns());
        }

        // Add registry excluded patterns
        if (secureRegistry.getExcludePatterns() != null) {
            allPaths.addAll(secureRegistry.getExcludePatterns());
        }

        // Add property-configured skip URLs
        if (secureProperties.getSkipUrl() != null) {
            allPaths.addAll(secureProperties.getSkipUrl());
        }

        // Remove duplicates and return
        return allPaths.stream()
                .distinct()
                .toArray(String[]::new);
    }
}
